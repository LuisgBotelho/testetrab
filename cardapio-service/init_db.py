
from database import conectar


def criar_tabelas():
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS produtos (
                    id SERIAL PRIMARY KEY,
                    nome VARCHAR(100) NOT NULL,
                    descricao TEXT NOT NULL,
                    preco NUMERIC(10, 2) NOT NULL
                        CHECK (preco > 0),
                    disponivel BOOLEAN NOT NULL DEFAULT TRUE
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS estatisticas_pedidos (
                    pedido_id INTEGER NOT NULL,
                    produto_id INTEGER NOT NULL,
                    quantidade INTEGER NOT NULL,
                    PRIMARY KEY (pedido_id, produto_id)
                )
            """)

    print("Tabelas do Cardápio verificadas com sucesso!")


criar_tabelas()
