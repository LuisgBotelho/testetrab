
const express = require('express');
const pool = require('./database');
const { buscarProduto } = require('./cardapio');
const { processarOutbox } = require('./outbox');

const app = express();
const PORTA = 3000;
const LIMITE_INTEIRO_POSTGRES = 2147483647;
const LIMITE_TOTAL_CENTAVOS = 9999999999;

function inteiroValido(valor) {
    return Number.isInteger(valor) && valor > 0 && valor <= LIMITE_INTEIRO_POSTGRES;
}

const {
    registrarMetricas,
    obterMetricas
} = require('./metrics');

app.use(express.json());
app.use(registrarMetricas);

app.get('/metrics', obterMetricas);

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok' });
    } catch (erro) {
        console.error('Banco de Pedidos indisponível:', erro.message);
        res.status(503).json({ status: 'indisponível' });
    }
});

app.param('id', (req, res, next, valor) => {
    const id = Number(valor);
    if (!/^\d+$/.test(valor) || !inteiroValido(id)) {
        return res.status(400).json({ mensagem: 'ID do pedido inválido' });
    }
    req.pedidoId = id;
    next();
});

// Rota inicial
app.get('/', (req, res) => {
    res.json({
        mensagem: 'API de Pedidos funcionando!'
    });
});


// Listar pedidos
app.get('/pedidos', async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM pedidos ORDER BY id'
        );

        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            mensagem: 'Erro ao listar pedidos'
        });
    }
});


// Buscar pedido pelo ID
app.get('/pedidos/:id', async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM pedidos WHERE id = $1',
            [req.pedidoId]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Pedido não encontrado'
            });
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            mensagem: 'Erro ao buscar pedido'
        });
    }
});


// Cadastrar pedido
app.post('/pedidos', async (req, res) => {
    const { cliente, itens } = req.body || {};

    // Validar nome do cliente
    if (typeof cliente !== 'string' || cliente.trim() === '' || Array.from(cliente.trim()).length > 100) {
        return res.status(400).json({
            mensagem: 'Informe um nome de cliente com até 100 caracteres'
        });
    }

    // Verificar se existem itens no pedido
    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({
            mensagem: 'O pedido precisa ter pelo menos um item'
        });
    }

    // Validar os dados recebidos
    const itensValidos = itens.every(item =>
        item !== null &&
        typeof item === 'object' &&
        inteiroValido(item.produto_id) &&
        inteiroValido(item.quantidade)
    );

    if (!itensValidos) {
        return res.status(400).json({
            mensagem: 'Existem itens com dados inválidos'
        });
    }

    const itensPedido = [];
    const quantidades = new Map();
    let totalCentavos = 0;

    try {
        // Consultar cada produto no microsserviço Python
        for (const item of itens) {
            const produto = await buscarProduto(item.produto_id);

            if (produto === null) {
                return res.status(400).json({
                    mensagem: `Produto ${item.produto_id} não encontrado`
                });
            }

            if (!produto.disponivel) {
                return res.status(400).json({
                    mensagem: `Produto ${produto.nome} indisponível`
                });
            }

            const precoCentavos = Math.round(Number(produto.preco) * 100);

            if (!Number.isSafeInteger(precoCentavos) || precoCentavos <= 0) {
                throw new Error('Preço inválido recebido do Cardápio');
            }

            const quantidadeAcumulada = (quantidades.get(produto.id) || 0) + item.quantidade;
            const valorItem = item.quantidade * precoCentavos;
            if (!inteiroValido(quantidadeAcumulada) || !Number.isSafeInteger(valorItem)
                || totalCentavos + valorItem > LIMITE_TOTAL_CENTAVOS) {
                return res.status(400).json({ mensagem: 'Quantidade ou total do pedido excede o limite' });
            }
            quantidades.set(produto.id, quantidadeAcumulada);

            // Guardar os dados do produto no pedido
            itensPedido.push({
                produto_id: produto.id,
                quantidade: item.quantidade,
                preco_unitario: precoCentavos / 100
            });

            // Somar o valor do item ao total
            totalCentavos += valorItem;
        }

    } catch (erro) {
        console.error('Erro na comunicação:', erro);

        return res.status(503).json({
            mensagem: 'Serviço de Cardápio indisponível ou com erro'
        });
    }

    // O pedido e o evento a publicar são persistidos na mesma operação.
    try {
        const itensEvento = itensPedido.map(({ produto_id, quantidade }) => ({ produto_id, quantidade }));
        const resultado = await pool.query(
            `WITH pedido AS (
                INSERT INTO pedidos (cliente, itens, total)
                VALUES ($1, $2, $3)
                RETURNING *
             ), evento AS (
                INSERT INTO pedidos_outbox (pedido_id, evento)
                SELECT id, jsonb_build_object('tipo', 'PedidoCriado', 'pedido_id', id, 'itens', $4::jsonb)
                FROM pedido
                RETURNING pedido_id
             )
             SELECT pedido.* FROM pedido JOIN evento ON evento.pedido_id = pedido.id`,
            [
                cliente.trim(),
                JSON.stringify(itensPedido),
                (totalCentavos / 100).toFixed(2),
                JSON.stringify(itensEvento)
            ]
        );

        res.status(201).json({
            ...resultado.rows[0],
            evento_agendado: true
        });

    } catch (erro) {
        console.error('Erro no banco:', erro);

        res.status(500).json({
            mensagem: 'Erro ao salvar pedido'
        });
    }
});


// Atualizar status do pedido
app.put('/pedidos/:id', async (req, res) => {
    const { status } = req.body || {};

    const statusPermitidos = [
        'pendente',
        'em preparo',
        'pronto',
        'entregue',
        'cancelado'
    ];

    if (!statusPermitidos.includes(status)) {
        return res.status(400).json({
            mensagem: 'Status inválido'
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE pedidos
             SET status = $1
             WHERE id = $2
             RETURNING *`,
            [status, req.pedidoId]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Pedido não encontrado'
            });
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            mensagem: 'Erro ao atualizar pedido'
        });
    }
});


// Excluir pedido
app.delete('/pedidos/:id', async (req, res) => {
    try {
        const resultado = await pool.query(
            'DELETE FROM pedidos WHERE id = $1 RETURNING id',
            [req.pedidoId]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Pedido não encontrado'
            });
        }

        res.json({
            mensagem: 'Pedido excluído com sucesso'
        });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            mensagem: 'Erro ao excluir pedido'
        });
    }
});


// Iniciar servidor
app.listen(PORTA, () => {
    console.log(`API de Pedidos rodando na porta ${PORTA}`);
    processarOutbox();
});
