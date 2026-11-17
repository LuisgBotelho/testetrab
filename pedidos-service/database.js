const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5434),
    database: process.env.DB_NAME || 'pedidos_db',
    user: process.env.DB_USER || 'pedidos_user',
    password: process.env.DB_PASSWORD || 'pedidos123',
    connectionTimeoutMillis: 5000
});

pool.on('error', erro => console.error('Conexão ociosa com o banco de Pedidos:', erro.message));

module.exports = pool;
