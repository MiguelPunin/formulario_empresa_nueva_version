import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { importSigners } from '../server/signer-admin.js';

const entries = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (entries.some(p => p.demo) && process.env.NODE_ENV === 'production') throw new Error('No se importan claves DEMO en producción.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await importSigners(client, entries, process.env.SIGNER_CODE_PEPPER, process.argv.includes('--update'));
  await client.query('COMMIT'); console.log('Firmantes importados. Las claves no se muestran ni se devuelven por API.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
