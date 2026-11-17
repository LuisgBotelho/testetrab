const amqp = require('amqplib');

const FILA = 'pedidos_criados';


async function publicarPedido(evento) {
    const usuario = process.env.RABBITMQ_USER;
    const senha = process.env.RABBITMQ_PASSWORD;
    const host = process.env.RABBITMQ_HOST || 'localhost';

    if (!usuario || !senha) {
        throw new Error('Credenciais do RabbitMQ não configuradas');
    }

    const conexao = await amqp.connect({
        protocol: 'amqp',
        hostname: host,
        port: 5672,
        username: usuario,
        password: senha,
        heartbeat: 5
    }, { timeout: 3000 });
    conexao.on('error', erro => console.error('Conexão RabbitMQ:', erro.message));

    try {
        const canal = await conexao.createConfirmChannel();
        canal.on('error', erro => console.error('Canal RabbitMQ:', erro.message));

        await canal.assertQueue(FILA, {
            durable: true
        });

        let devolvido = false;
        canal.once('return', () => { devolvido = true; });
        canal.sendToQueue(
            FILA,
            Buffer.from(JSON.stringify(evento)),
            { persistent: true, mandatory: true, contentType: 'application/json' }
        );

        await canal.waitForConfirms();
        if (devolvido) {
            throw new Error(`Evento devolvido pelo RabbitMQ para a fila ${FILA}`);
        }
    } finally {
        await conexao.close().catch(erro => console.error('Fechamento RabbitMQ:', erro.message));
    }
}

module.exports = { publicarPedido };
