from decimal import Decimal
from typing import Annotated

import psycopg
from fastapi import FastAPI, HTTPException, Path
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints
from database import conectar
from metrics import registrar_metricas, obter_metricas

app = FastAPI(title="FoodFlow - Cardápio")
app.middleware("http")(registrar_metricas)


@app.get("/metrics")
def metricas():
    return obter_metricas()


@app.get("/health")
def health():
    try:
        with conectar() as conexao:
            conexao.execute("SELECT 1")
    except psycopg.Error:
        return JSONResponse({"status": "indisponível"}, status_code=503)
    return {"status": "ok"}


ProdutoId = Annotated[int, Path(gt=0, le=2147483647)]


class Produto(BaseModel):
    nome: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    descricao: str
    preco: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    disponivel: bool = True


@app.get("/")
def inicio():
    return {"mensagem": "API de Cardápio funcionando!"}


@app.get("/produtos")
def listar_produtos():
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            cursor.execute("SELECT * FROM produtos ORDER BY id")
            produtos = cursor.fetchall()

    return produtos


@app.get("/produtos/{produto_id}")
def buscar_produto(produto_id: ProdutoId):
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM produtos WHERE id = %s",
                (produto_id,)
            )
            produto = cursor.fetchone()

    if produto is None:
        raise HTTPException(
            status_code=404,
            detail="Produto não encontrado"
        )

    return produto


@app.post("/produtos", status_code=201)
def cadastrar_produto(produto: Produto):
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO produtos
                    (nome, descricao, preco, disponivel)
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (
                    produto.nome,
                    produto.descricao,
                    produto.preco,
                    produto.disponivel
                )
            )
            novo_produto = cursor.fetchone()

    return novo_produto


@app.put("/produtos/{produto_id}")
def atualizar_produto(produto_id: ProdutoId, dados: Produto):
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            cursor.execute(
                """
                UPDATE produtos
                SET nome = %s,
                    descricao = %s,
                    preco = %s,
                    disponivel = %s
                WHERE id = %s
                RETURNING *
                """,
                (
                    dados.nome,
                    dados.descricao,
                    dados.preco,
                    dados.disponivel,
                    produto_id
                )
            )
            produto = cursor.fetchone()

    if produto is None:
        raise HTTPException(
            status_code=404,
            detail="Produto não encontrado"
        )

    return produto


@app.delete("/produtos/{produto_id}")
def excluir_produto(produto_id: ProdutoId):
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            cursor.execute(
                "DELETE FROM produtos WHERE id = %s RETURNING id",
                (produto_id,)
            )
            produto = cursor.fetchone()

    if produto is None:
        raise HTTPException(
            status_code=404,
            detail="Produto não encontrado"
        )

    return {"mensagem": "Produto excluído com sucesso"}


@app.get("/estatisticas")
def listar_estatisticas():
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            cursor.execute("""
                SELECT
                    produto_id,
                    SUM(quantidade) AS quantidade_total
                FROM estatisticas_pedidos
                GROUP BY produto_id
                ORDER BY produto_id
            """)

            estatisticas = cursor.fetchall()

    return estatisticas
