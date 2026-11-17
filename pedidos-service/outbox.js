const pool = require('./database');
const { publicarPedido } = require('./mensageria');

async function publicarProximo() {
    const conexao = await pool.connect();

    try {
        await conexao.query('BEGIN');
        const resultado = await conexao.query(`
            SELECT pedido_id, evento
            FROM pedidos_outbox
            ORDER BY pedido_id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `);
        const pendencia = resultado.rows[0];

        if (pendencia) {
            await publicarPedido(pendencia.evento);
            await conexao.query('DELETE FROM pedidos_outbox WHERE pedido_id = $1', [pendencia.pedido_id]);
        }

        await conexao.query('COMMIT');

        if (pendencia) {
            console.log(`Evento do pedido ${pendencia.pedido_id} confirmado pelo RabbitMQ`);
        }

        return Boolean(pendencia);
    } catch (erro) {
        await conexao.query('ROLLBACK').catch(falha => console.error('Rollback do outbox:', falha.message));
        throw erro;
    } finally {
        conexao.release();
    }
}

async function processarOutbox() {
    try {
        while (await publicarProximo()) {
            // Drena os eventos pendentes antes de aguardar a próxima busca.
        }
    } catch (erro) {
        console.error('Evento pendente. Próxima tentativa em 2 segundos:', erro.message);
    } finally {
        setTimeout(processarOutbox, 2000).unref();
    }
}

module.exports = { processarOutbox };
