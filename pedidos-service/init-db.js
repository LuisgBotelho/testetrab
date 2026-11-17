
const pool = require('./database');

async function criarTabela() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                cliente VARCHAR(100) NOT NULL,
                itens JSONB NOT NULL,
                total NUMERIC(10, 2) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'pendente'
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos_outbox (
                pedido_id INTEGER PRIMARY KEY,
                evento JSONB NOT NULL
            )
        `);

        console.log('Tabelas de pedidos e eventos verificadas.');
    } catch (erro) {
        console.error('Erro ao criar tabela:', erro);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

criarTabela();
