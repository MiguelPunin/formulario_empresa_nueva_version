import pg from 'pg';
import { deleteExpiredReports, startRetention } from './retention.js';
import { readConfig } from './config.js';
import { createApp } from './app.js';
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 8000, statement_timeout: 15000 });
pool.on('error', error => console.error('Database pool error', { code: error.code || 'CONNECTION' }));
await pool.query('SELECT 1 FROM reports LIMIT 1');
await deleteExpiredReports(pool);
const stopRetention = startRetention(pool);
const server = createApp(pool, config).listen(config.port, '0.0.0.0', () => console.log(`Reportes: http://localhost:${config.port}`));
async function shutdown() { stopRetention(); server.close(async () => { await pool.end(); process.exit(0); }); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
