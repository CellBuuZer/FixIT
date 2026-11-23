// Importa DB/fixit.sql a la base de datos indicada en MYSQL_PUBLIC_URL.
import mysql from 'mysql2/promise';
import fs from 'node:fs';

const raw = process.env.MYSQL_PUBLIC_URL;
if (!raw) {
  console.error('Falta la variable MYSQL_PUBLIC_URL.');
  process.exit(1);
}

const u = new URL(raw);
const sql = fs.readFileSync(new URL('./DB/fixit.sql', import.meta.url), 'utf8');

const conn = await mysql.createConnection({
  host: u.hostname,
  port: Number(u.port || 3306),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  charset: 'utf8mb4',
  multipleStatements: true
});

try {
  console.log(`Conectado a ${u.hostname}:${u.port}. Importando ${(sql.length / 1024).toFixed(0)} KB...`);
  await conn.query(sql);
  const [t] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()');
  const [x] = await conn.query('SELECT COUNT(*) AS n FROM usuarios');
  console.log(`Listo. Tablas: ${t[0].n} (esperado 36). Usuarios: ${x[0].n} (esperado 9).`);
} catch (err) {
  console.error('Error durante la importación:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}