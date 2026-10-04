import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
export async function migrate(databaseUrl, schema = 'public') {
  if (!databaseUrl) throw new Error('Falta DATABASE_URL');
  return runner({ databaseUrl, dir: fileURLToPath(new URL('./migrations', import.meta.url)),
    migrationsTable: 'pgmigrations', schema, direction: 'up', log: () => {} });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate(process.env.DATABASE_URL);
  console.log('Migraciones completadas.');
}
