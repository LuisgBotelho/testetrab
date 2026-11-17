
const API = '';

let produtos = [];
let carrinho = [];


function mostrarTela(idTela) {
    document.querySelectorAll('.tela').forEach(tela => {
        tela.hidden = true;
    });

    document.getElementById(idTela).hidden = false;

    if (idTela === 'cardapio') {
        carregarProdutos();
    }

    if (idTela === 'novo-pedido') {
        carregarProdutos();
    }

    if (idTela === 'pedidos') {
        carregarPedidos();
    }

    if (idTela === 'estatisticas') {
        carregarEstatisticas();
    }
}


function formatarPreco(valor) {
    return Number(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}


async function carregarProdutos() {
    try {
        const resposta = await fetch(`${API}/produtos`);

        if (!resposta.ok) {
            throw new Error('Erro ao buscar produtos');
        }

        produtos = await resposta.json();

        mostrarProdutos();
        atualizarSelecaoProdutos();
    } catch (erro) {
        console.error(erro);
        alert('Não foi possível carregar os produtos.');
    }
}


function mostrarProdutos() {
    const tabela = document.getElementById('lista-produtos');
    tabela.innerHTML = '';

    for (const produto of produtos) {
        const linha = document.createElement('tr');

        const valores = [
            produto.id,
            produto.nome,
            formatarPreco(produto.preco),
            produto.disponivel ? 'Disponível' : 'Indisponível'
        ];

        for (const valor of valores) {
            const coluna = document.createElement('td');
            coluna.textContent = valor;
            linha.appendChild(coluna);
        }

        const colunaAcoes = document.createElement('td');

        const botaoEditar = document.createElement('button');
        botaoEditar.textContent = 'Editar';
        botaoEditar.onclick = () => editarProduto(produto.id);

        const botaoExcluir = document.createElement('button');
        botaoExcluir.textContent = 'Excluir';
        botaoExcluir.className = 'excluir';
        botaoExcluir.onclick = () => excluirProduto(produto.id);

        colunaAcoes.appendChild(botaoEditar);
        colunaAcoes.appendChild(botaoExcluir);
        linha.appendChild(colunaAcoes);

        tabela.appendChild(linha);
    }
}


const formularioProduto = document.getElementById('form-produto');
const botaoSalvarProduto = document.getElementById('botao-salvar');


formularioProduto.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (botaoSalvarProduto.disabled) {
        return;
    }

    const id = document.getElementById('produto-id').value;

    const produto = {
        nome: document.getElementById('nome').value,
        descricao: document.getElementById('descricao').value,
        preco: Number(document.getElementById('preco').value),
        disponivel: document.getElementById('disponivel').checked
    };

    const url = id ? `/produtos/${id}` : '/produtos';
    const metodo = id ? 'PUT' : 'POST';
    botaoSalvarProduto.disabled = true;

    try {
        const resposta = await fetch(url, {
            method: metodo,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(produto)
        });

        if (!resposta.ok) {
            throw new Error('Erro ao salvar produto');
        }

        alert('Produto salvo com sucesso!');
        limparFormularioProduto();
        carregarProdutos();

    } catch (erro) {
        console.error(erro);
        alert('Não foi possível salvar o produto.');
    } finally {
        botaoSalvarProduto.disabled = false;
    }
});


function editarProduto(id) {
    const produto = produtos.find(p => p.id === id);

    if (!produto) {
        return;
    }

    document.getElementById('produto-id').value = produto.id;
    document.getElementById('nome').value = produto.nome;
    document.getElementById('descricao').value = produto.descricao;
    document.getElementById('preco').value = produto.preco;
    document.getElementById('disponivel').checked = produto.disponivel;

    document.getElementById('botao-salvar').textContent = 'Atualizar Produto';
    document.getElementById('cancelar-edicao').hidden = false;
}


function limparFormularioProduto() {
    formularioProduto.reset();

    document.getElementById('produto-id').value = '';
    document.getElementById('botao-salvar').textContent = 'Salvar Produto';
    document.getElementById('cancelar-edicao').hidden = true;
}


document.getElementById('cancelar-edicao').onclick = limparFormularioProduto;


async function excluirProduto(id) {
    if (!confirm('Deseja realmente excluir este produto?')) {
        return;
    }

    try {
        const resposta = await fetch(`/produtos/${id}`, {
            method: 'DELETE'
        });

        if (!resposta.ok) {
            throw new Error('Erro ao excluir produto');
        }

        alert('Produto excluído com sucesso!');
        carregarProdutos();

    } catch (erro) {
        console.error(erro);
        alert('Não foi possível excluir o produto.');
    }
}


function atualizarSelecaoProdutos() {
    const selecao = document.getElementById('produto-pedido');
    selecao.innerHTML = '';

    for (const produto of produtos) {
        if (!produto.disponivel) {
            continue;
        }

        const opcao = document.createElement('option');

        opcao.value = produto.id;
        opcao.textContent =
            `${produto.nome} - ${formatarPreco(produto.preco)}`;

        selecao.appendChild(opcao);
    }
}


document.getElementById('adicionar-item').onclick = () => {
    const produtoId = Number(
        document.getElementById('produto-pedido').value
    );

    const quantidade = Number(
        document.getElementById('quantidade').value
    );

    const produto = produtos.find(p => p.id === produtoId);

    if (!produto || !Number.isInteger(quantidade) || quantidade <= 0) {
        alert('Selecione um produto e uma quantidade válida.');
        return;
    }

    const itemExistente = carrinho.find(
        item => item.produto_id === produtoId
    );

    if (itemExistente) {
        itemExistente.quantidade += quantidade;
    } else {
        carrinho.push({
            produto_id: produtoId,
            nome: produto.nome,
            quantidade: quantidade,
            preco: Number(produto.preco)
        });
    }

    mostrarCarrinho();
};


function mostrarCarrinho() {
    const container = document.getElementById('itens-pedido');
    container.innerHTML = '';

    let total = 0;

    for (const item of carrinho) {
        const subtotal = item.quantidade * item.preco;
        total += subtotal;

        const linha = document.createElement('div');
        linha.className = 'item-carrinho';

        const descricao = document.createElement('span');
        descricao.textContent =
            `${item.quantidade}x ${item.nome} - ${formatarPreco(subtotal)}`;

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = 'Remover';
        botao.className = 'excluir';
        botao.onclick = () => removerItem(item.produto_id);

        linha.appendChild(descricao);
        linha.appendChild(botao);

        container.appendChild(linha);
    }

    document.getElementById('total-pedido').textContent =
        formatarPreco(total);
}


function removerItem(produtoId) {
    carrinho = carrinho.filter(
        item => item.produto_id !== produtoId
    );

    mostrarCarrinho();
}


const formularioPedido = document.getElementById('form-pedido');
const botaoConfirmarPedido = document.getElementById('confirmar-pedido');
const retornoPedido = document.getElementById('retorno-pedido');

formularioPedido.addEventListener(
    'submit',
    async (evento) => {
        evento.preventDefault();

        if (botaoConfirmarPedido.disabled) {
            return;
        }

        const cliente = document.getElementById('cliente').value.trim();

        if (!cliente || carrinho.length === 0) {
            alert('Informe o cliente e adicione pelo menos um produto.');
            return;
        }

        const itens = carrinho.map(item => ({
            produto_id: item.produto_id,
            quantidade: item.quantidade
        }));

        const pedido = {
            cliente: cliente,
            itens: itens
        };

        const controles = [...formularioPedido.elements].filter(campo => !campo.disabled);
        controles.forEach(campo => { campo.disabled = true; });
        retornoPedido.hidden = true;
        botaoConfirmarPedido.textContent = 'Enviando pedido...';

        try {
            const resposta = await fetch('/pedidos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(pedido)
            });

            const resultado = await resposta.json();

            if (!resposta.ok) {
                alert(resultado.mensagem || 'Erro ao cadastrar pedido.');
                return;
            }

            const aviso = resultado.evento_agendado
                ? ' As estatísticas serão atualizadas após processar o evento.'
                : '';
            retornoPedido.textContent = `Pedido ${resultado.id} criado com sucesso!${aviso}`;
            retornoPedido.hidden = false;

            carrinho = [];
            formularioPedido.reset();
            mostrarCarrinho();
            carregarProdutos();

        } catch (erro) {
            console.error(erro);
            alert('Não foi possível confirmar o resultado. Confira a tela Pedidos antes de tentar novamente.');
        } finally {
            controles.forEach(campo => { campo.disabled = false; });
            botaoConfirmarPedido.textContent = 'Confirmar Pedido';
        }
    }
);


async function carregarPedidos() {
    try {
        const resposta = await fetch('/pedidos');

        if (!resposta.ok) {
            throw new Error('Erro ao buscar pedidos');
        }

        const pedidos = await resposta.json();
        const container = document.getElementById('lista-pedidos');

        container.innerHTML = '';

        for (const pedido of pedidos) {
            const card = document.createElement('div');
            card.className = 'pedido-card';

            const titulo = document.createElement('h3');
            titulo.textContent = `Pedido #${pedido.id}`;

            const cliente = document.createElement('p');
            cliente.textContent = `Cliente: ${pedido.cliente}`;

            const total = document.createElement('p');
            total.textContent = `Total: ${formatarPreco(pedido.total)}`;

            const itens = document.createElement('ul');

            for (const item of pedido.itens) {
                const linha = document.createElement('li');

                linha.textContent =
                    `Produto ${item.produto_id} - ` +
                    `${item.quantidade} unidade(s) - ` +
                    `${formatarPreco(item.preco_unitario)} cada`;

                itens.appendChild(linha);
            }

            const status = document.createElement('select');

            const opcoes = [
                'pendente',
                'em preparo',
                'pronto',
                'entregue',
                'cancelado'
            ];

            for (const opcao of opcoes) {
                const elemento = document.createElement('option');

                elemento.value = opcao;
                elemento.textContent = opcao;
                elemento.selected = pedido.status === opcao;

                status.appendChild(elemento);
            }

            const botaoAtualizar = document.createElement('button');
            botaoAtualizar.textContent = 'Atualizar Status';

            botaoAtualizar.onclick = () => {
                atualizarStatus(pedido.id, status.value);
            };

            const botaoExcluir = document.createElement('button');
            botaoExcluir.textContent = 'Excluir Pedido';
            botaoExcluir.className = 'excluir';

            botaoExcluir.onclick = () => {
                excluirPedido(pedido.id);
            };

            const acoes = document.createElement('div');
            acoes.className = 'acoes';

            acoes.appendChild(botaoAtualizar);
            acoes.appendChild(botaoExcluir);

            card.appendChild(titulo);
            card.appendChild(cliente);
            card.appendChild(itens);
            card.appendChild(total);
            card.appendChild(status);
            card.appendChild(acoes);

            container.appendChild(card);
        }

    } catch (erro) {
        console.error(erro);
        alert('Não foi possível carregar os pedidos.');
    }
}


async function atualizarStatus(id, status) {
    try {
        const resposta = await fetch(`/pedidos/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: status })
        });

        if (!resposta.ok) {
            throw new Error('Erro ao atualizar pedido');
        }

        alert('Status atualizado com sucesso!');
        carregarPedidos();

    } catch (erro) {
        console.error(erro);
        alert('Não foi possível atualizar o pedido.');
    }
}


async function excluirPedido(id) {
    if (!confirm('Deseja realmente excluir este pedido?')) {
        return;
    }

    try {
        const resposta = await fetch(`/pedidos/${id}`, {
            method: 'DELETE'
        });

        if (!resposta.ok) {
            throw new Error('Erro ao excluir pedido');
        }

        alert('Pedido excluído com sucesso!');
        carregarPedidos();

    } catch (erro) {
        console.error(erro);
        alert('Não foi possível excluir o pedido.');
    }
}


const botaoEstatisticas = document.getElementById('atualizar-estatisticas');
botaoEstatisticas.addEventListener('click', carregarEstatisticas);


async function carregarEstatisticas() {
    if (botaoEstatisticas.disabled) {
        return;
    }

    const tabela = document.getElementById('lista-estatisticas');
    const retorno = document.getElementById('retorno-estatisticas');
    botaoEstatisticas.disabled = true;
    retorno.textContent = 'Carregando estatísticas...';

    try {
        const resposta = await fetch(`${API}/estatisticas`);
        if (!resposta.ok) {
            throw new Error('Erro ao buscar estatísticas');
        }

        const estatisticas = await resposta.json();
        tabela.replaceChildren();

        for (const item of estatisticas) {
            const linha = tabela.insertRow();
            linha.insertCell().textContent = item.produto_id;
            linha.insertCell().textContent = item.quantidade_total;
        }

        retorno.textContent = estatisticas.length === 0
            ? 'Ainda não há eventos de pedidos processados.'
            : 'Estatísticas atualizadas.';
    } catch (erro) {
        console.error(erro);
        retorno.textContent = 'Não foi possível carregar as estatísticas. Tente novamente.';
    } finally {
        botaoEstatisticas.disabled = false;
    }
}


// Carregar a tela inicial
mostrarTela('cardapio');
