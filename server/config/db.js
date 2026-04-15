const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || 'xclusive_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'xclusive_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => console.log('📦 DB connected'));
pool.on('error', (err) => console.error('❌ DB error:', err));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
