
const URL_CARDAPIO =
    process.env.CARDAPIO_URL || 'http://localhost:8000';


async function buscarProduto(id) {
    const resposta = await fetch(
        `${URL_CARDAPIO}/produtos/${id}`,
        {
            signal: AbortSignal.timeout(5000)
        }
    );

    if (resposta.status === 404) {
        return null;
    }

    if (!resposta.ok) {
        throw new Error('Erro ao consultar o Cardápio');
    }

    const produto = await resposta.json();

    return produto;
}


module.exports = { buscarProduto };
