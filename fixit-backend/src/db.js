import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Muchos MySQL administrados (Aiven, PlanetScale, DigitalOcean, RDS...) exigen TLS.
// Activa DB_SSL=true. Solo usa DB_SSL_REJECT_UNAUTHORIZED=false si el proveedor
// usa un certificado que Node no reconoce y entiendes el riesgo.
const useSsl = process.env.DB_SSL === 'true';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  charset: 'utf8mb4',
  dateStrings: true,
  ssl: useSsl
    ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
      }
    : undefined
});

export async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
  } finally {
    if (connection) connection.release();
  }
}
