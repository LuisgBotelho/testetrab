"""Valida os CRUDs, a mensageria e a coleta do Prometheus com a pilha ativa."""

import argparse
from decimal import Decimal
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4


RAIZ_PROJETO = Path(__file__).resolve().parents[1]
SERVICOS = {"cardapio", "pedidos"}


def verificar(condicao, mensagem):
    if not condicao:
        raise RuntimeError(mensagem)


def requisitar(base, rota, metodo="GET", dados=None, status=200, ler_json=True):
    conteudo = None if dados is None else json.dumps(dados).encode("utf-8")
    headers = {} if dados is None else {"Content-Type": "application/json"}
    pedido = Request(f"{base.rstrip('/')}{rota}", conteudo, headers, method=metodo)

    try:
        with urlopen(pedido, timeout=5) as resposta:
            recebido = resposta.status
            corpo = resposta.read().decode("utf-8")
    except HTTPError as erro:
        recebido = erro.code
        corpo = erro.read().decode("utf-8", errors="replace")

    verificar(recebido == status, f"{metodo} {rota}: esperado HTTP {status}, recebido {recebido}. {corpo[:300]}")
    return json.loads(corpo) if ler_json and corpo else corpo


def aguardar(condicao, tempo, descricao):
    limite = time.monotonic() + tempo
    erro_atual = None
    while time.monotonic() < limite:
        try:
            if condicao():
                return
        except (RuntimeError, URLError) as erro:
            erro_atual = erro
        time.sleep(1)
    detalhe = f" Última resposta: {erro_atual}" if erro_atual else ""
    raise RuntimeError(f"Tempo esgotado ao aguardar {descricao}.{detalhe}")


def consultar_metricas(prometheus, expressao):
    parametros = urlencode({"query": expressao})
    corpo = requisitar(prometheus, f"/api/v1/query?{parametros}")
    verificar(corpo["status"] == "success", f"Falha na consulta Prometheus: {corpo}")
    return {serie["metric"]["job"]: float(serie["value"][1]) for serie in corpo["data"]["result"]}


def compose(*args):
    subprocess.run(["docker", "compose", *args], cwd=RAIZ_PROJETO, check=True, timeout=90)


def testar(gateway, prometheus, espera, testar_retentativa):
    aguardando_broker = False
    rota_produto = None
    rota_pedido = None
    identificador = uuid4().hex[:10]

    def quantidade_processada():
        estatisticas = requisitar(gateway, "/estatisticas")
        return next((int(item["quantidade_total"]) for item in estatisticas if item["produto_id"] == produto_id), 0)

    try:
        aguardar(
            lambda: "FoodFlow" in requisitar(gateway, "/", ler_json=False),
            espera,
            "interface pelo gateway",
        )
        aguardar(lambda: isinstance(requisitar(gateway, "/produtos"), list), espera, "API de Cardápio")
        aguardar(lambda: isinstance(requisitar(gateway, "/pedidos"), list), espera, "API de Pedidos")
        print("Gateway e duas APIs responderam.", flush=True)
        aguardar(
            lambda: set(consultar_metricas(prometheus, 'up{job=~"cardapio|pedidos"} == 1')) == SERVICOS,
            espera,
            "dois alvos ativos no Prometheus",
        )
        consulta = 'sum by (job) (http_requests_total{job=~"cardapio|pedidos",metodo="POST",status="201"})'
        contagens_iniciais = consultar_metricas(prometheus, consulta)

        produto = {"nome": f"Produto smoke {identificador}", "descricao": "Produto do teste", "preco": 10.5, "disponivel": True}
        criado = requisitar(gateway, "/produtos", "POST", produto, status=201)
        produto_id = criado["id"]
        rota_produto = f"/produtos/{produto_id}"
        verificar(requisitar(gateway, rota_produto)["nome"] == produto["nome"], "O produto criado não foi encontrado.")
        verificar(any(item["id"] == produto_id for item in requisitar(gateway, "/produtos")), "O produto não apareceu na listagem.")
        produto["preco"] = 12.4
        requisitar(gateway, rota_produto, "PUT", produto)
        verificar(Decimal(str(requisitar(gateway, rota_produto)["preco"])) == Decimal("12.40"), "O preço atualizado não foi salvo.")
        print(f"Produto {produto_id} criado, lido e atualizado.", flush=True)

        if testar_retentativa:
            aguardando_broker = True
            compose("stop", "rabbitmq")

        cliente = f"Cliente smoke {identificador}"
        dados = {"cliente": cliente, "itens": [{"produto_id": produto_id, "quantidade": 2, "preco_unitario": 0.01}]}
        pedido = requisitar(gateway, "/pedidos", "POST", dados, status=201)
        pedido_id = pedido["id"]
        rota_pedido = f"/pedidos/{pedido_id}"
        verificar(pedido.get("evento_agendado") is True, "O pedido não confirmou o agendamento do evento.")
        verificar(pedido["cliente"] == cliente, "O cliente retornado não corresponde ao pedido enviado.")
        verificar(Decimal(str(pedido["total"])) == Decimal("24.80"), "O total não usou o preço atualizado do Cardápio.")
        verificar(requisitar(gateway, rota_pedido)["status"] == "pendente", "O status inicial não foi salvo.")
        verificar(any(item["id"] == pedido_id for item in requisitar(gateway, "/pedidos")), "O pedido não apareceu na listagem.")

        if testar_retentativa:
            verificar(quantidade_processada() == 0, "O evento já foi consumido com o RabbitMQ parado.")
            compose("start", "rabbitmq")
            aguardando_broker = False

        requisitar(gateway, rota_pedido, "PUT", {"status": "pronto"})
        verificar(requisitar(gateway, rota_pedido)["status"] == "pronto", "A atualização de status não foi persistida.")
        print(f"Pedido {pedido_id} criado, lido e atualizado. O preço veio da API de Cardápio.", flush=True)

        aguardar(lambda: quantidade_processada() == 2, espera, "processamento do evento pela fila")
        print("Evento refletido nas estatísticas do Cardápio.", flush=True)

        def registrou_posts():
            atual = consultar_metricas(prometheus, consulta)
            return all(atual.get(servico, 0) > contagens_iniciais.get(servico, 0) for servico in SERVICOS)

        aguardar(registrou_posts, espera, "métricas dos POSTs das duas APIs")
        print("Prometheus coletou métricas HTTP das duas APIs.", flush=True)

        requisitar(gateway, rota_pedido, "DELETE")
        requisitar(gateway, rota_pedido, status=404)
        rota_pedido = None
        requisitar(gateway, rota_produto, "DELETE")
        requisitar(gateway, rota_produto, status=404)
        rota_produto = None
        print("Exclusões confirmadas. O evento já processado permanece no histórico.", flush=True)
    finally:
        if aguardando_broker:
            try:
                compose("start", "rabbitmq")
            except (OSError, subprocess.SubprocessError) as erro:
                print(f"Falha ao religar o RabbitMQ: {erro}", file=sys.stderr)
        for rota in (rota_pedido, rota_produto):
            if rota:
                try:
                    requisitar(gateway, rota, "DELETE")
                except (RuntimeError, URLError) as erro:
                    print(f"Falha ao limpar {rota}: {erro}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gateway", default="http://127.0.0.1:8080")
    parser.add_argument("--prometheus", default="http://127.0.0.1:9090")
    parser.add_argument("--espera", type=int, default=90, help="Limite em segundos para cada etapa de espera.")
    parser.add_argument("--testar-retentativa", action="store_true", help="Para e reinicia o RabbitMQ durante o teste. Use em uma pilha local dedicada.")
    args = parser.parse_args()

    try:
        testar(args.gateway, args.prometheus, args.espera, args.testar_retentativa)
    except (RuntimeError, URLError, ValueError, KeyError, OSError, subprocess.SubprocessError) as erro:
        print(f"Validação falhou: {erro}", file=sys.stderr)
        return 1
    print("Validação concluída.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
