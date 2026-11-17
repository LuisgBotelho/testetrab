
import json
import os
import time

import pika

from database import conectar


FILA = "pedidos_criados"


def processar_evento(evento):
    if not isinstance(evento, dict) or evento.get("tipo") != "PedidoCriado":
        raise ValueError("Tipo de evento inválido")

    pedido_id = evento["pedido_id"]
    itens = evento["itens"]

    if type(pedido_id) is not int or not 0 < pedido_id <= 2147483647:
        raise ValueError("ID do pedido inválido")

    if not isinstance(itens, list) or not itens:
        raise ValueError("Lista de itens inválida")

    # Agrupar produtos repetidos dentro do mesmo pedido
    quantidades = {}

    for item in itens:
        produto_id = item["produto_id"]
        quantidade = item["quantidade"]

        if (
            type(produto_id) is not int
            or not 0 < produto_id <= 2147483647
            or type(quantidade) is not int
            or not 0 < quantidade <= 2147483647
        ):
            raise ValueError("Item inválido")

        quantidades[produto_id] = quantidades.get(produto_id, 0) + quantidade
        if quantidades[produto_id] > 2147483647:
            raise ValueError("Quantidade total do produto fora do limite")

    # Registrar os dados no PostgreSQL
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            for produto_id, quantidade in quantidades.items():
                cursor.execute(
                    """
                    INSERT INTO estatisticas_pedidos
                        (pedido_id, produto_id, quantidade)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (pedido_id, produto_id)
                    DO NOTHING
                    """,
                    (pedido_id, produto_id, quantidade)
                )

    print(f"Estatísticas do pedido {pedido_id} registradas")


def receber_mensagem(canal, metodo, propriedades, corpo):
    try:
        evento = json.loads(corpo)
        processar_evento(evento)

        canal.basic_ack(
            delivery_tag=metodo.delivery_tag
        )

    except (ValueError, KeyError, TypeError) as erro:
        print(f"Mensagem inválida: {erro}")

        canal.basic_reject(
            delivery_tag=metodo.delivery_tag,
            requeue=False
        )

    except Exception as erro:
        print(f"Erro ao processar mensagem: {erro}")

        time.sleep(5)

        canal.basic_nack(
            delivery_tag=metodo.delivery_tag,
            requeue=True
        )


def iniciar_consumidor():
    host = os.getenv("RABBITMQ_HOST", "localhost")
    usuario = os.environ["RABBITMQ_USER"]
    senha = os.environ["RABBITMQ_PASSWORD"]

    credenciais = pika.PlainCredentials(usuario, senha)

    parametros = pika.ConnectionParameters(
        host=host,
        port=5672,
        credentials=credenciais,
        heartbeat=30,
        blocked_connection_timeout=30
    )

    conexao = pika.BlockingConnection(parametros)
    canal = conexao.channel()

    canal.queue_declare(
        queue=FILA,
        durable=True
    )

    canal.basic_qos(prefetch_count=1)

    canal.basic_consume(
        queue=FILA,
        on_message_callback=receber_mensagem,
        auto_ack=False
    )

    print("Aguardando eventos de pedidos...")
    try:
        canal.start_consuming()
    finally:
        if conexao.is_open:
            conexao.close()


if __name__ == "__main__":
    while True:
        try:
            iniciar_consumidor()
        except Exception as erro:
            print(f"Conexão interrompida: {erro}")
            time.sleep(5)
