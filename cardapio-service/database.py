import os
import psycopg
from psycopg.rows import dict_row


def conectar():
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5433"),
        dbname=os.getenv("DB_NAME", "cardapio_db"),
        user=os.getenv("DB_USER", "cardapio_user"),
        password=os.getenv("DB_PASSWORD", "cardapio123"),
        connect_timeout=5,
        row_factory=dict_row
    )
