import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { z } from 'zod';
import { hashPassword } from '../server/password.js';

// Input file is private: never commit passwords to the repository.
const entries = z.array(z.object({
  username: z.string().regex(/^[a-z0-9._-]+$/),
  name: z.string().min(1), initials: z.string().min(1).max(12),
  password: z.string().min(8).max(128),
}).strict()).min(1).parse(JSON.parse(await readFile(process.argv[2], 'utf8')));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const u of entries) {
    const result = await client.query(`INSERT INTO users(username,full_name,support_initials,password_hash)
      VALUES($1,$2,$3,$4) ON CONFLICT(username) DO NOTHING RETURNING username`,
    [u.username, u.name, u.initials, await hashPassword(u.password)]);
    console.log(u.username + (result.rowCount ? ': creado' : ': ya existe (sin cambios)'));
  }
  await client.query('COMMIT');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
