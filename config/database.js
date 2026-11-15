
const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || 'localhost';

const isRemoteDatabase = ![
  'localhost',
  '127.0.0.1'
].includes(host);

const pool = mysql.createPool({
  host,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wanjala_solutions',

  // Enable TLS for TiDB Cloud
  ssl: (
    process.env.DB_ENABLE_SSL === 'true' || isRemoteDatabase
  )
    ? { minVersion: 'TLSv1.2' }
    : undefined,

  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4'
});

module.exports = pool;
