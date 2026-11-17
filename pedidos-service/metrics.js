
const client = require('prom-client');

client.collectDefaultMetrics();


const requisicoes = new client.Counter({
    name: 'http_requests_total',
    help: 'Quantidade de requisicoes HTTP',
    labelNames: ['metodo', 'rota', 'status']
});


const duracao = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duracao das requisicoes HTTP',
    labelNames: ['metodo', 'rota']
});


function registrarMetricas(req, res, next) {
    if (req.path === '/metrics') {
        return next();
    }

    const inicio = process.hrtime.bigint();

    res.on('finish', () => {
        const fim = process.hrtime.bigint();

        const tempo = Number(fim - inicio) / 1e9;

        const rota = req.route ? req.route.path : 'desconhecida';

        requisicoes.inc({
            metodo: req.method,
            rota: rota,
            status: String(res.statusCode)
        });

        duracao.observe({
            metodo: req.method,
            rota: rota
        }, tempo);
    });

    next();
}


async function obterMetricas(req, res) {
    res.set('Content-Type', client.register.contentType);

    const metricas = await client.register.metrics();

    res.send(metricas);
}


module.exports = {
    registrarMetricas,
    obterMetricas
};
