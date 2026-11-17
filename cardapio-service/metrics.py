
import time

from fastapi import Request, Response
from prometheus_client import (
    Counter,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST
)


REQUISICOES = Counter(
    "http_requests_total",
    "Quantidade de requisicoes HTTP",
    ["metodo", "rota", "status"]
)


DURACAO = Histogram(
    "http_request_duration_seconds",
    "Duracao das requisicoes HTTP",
    ["metodo", "rota"]
)


async def registrar_metricas(request: Request, call_next):
    if request.url.path == "/metrics":
        return await call_next(request)

    inicio = time.perf_counter()

    resposta = await call_next(request)

    duracao = time.perf_counter() - inicio

    rota = request.scope.get("route")
    nome_rota = rota.path if rota else "desconhecida"

    REQUISICOES.labels(
        metodo=request.method,
        rota=nome_rota,
        status=str(resposta.status_code)
    ).inc()

    DURACAO.labels(
        metodo=request.method,
        rota=nome_rota
    ).observe(duracao)

    return resposta


def obter_metricas():
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
