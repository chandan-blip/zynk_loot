const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'zynkpassword',
  database: process.env.DB_NAME || 'zynk_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

const testConnection = async () => {
  const connection = await pool.getConnection();
  await connection.ping();
  connection.release();
  return true;
};

module.exports = {
  pool,
  testConnection,
  query: (sql, params) => pool.execute(sql, params),
  getConnection: () => pool.getConnection()
};
