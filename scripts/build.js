import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const source = resolve('formulario/formulario_empresa/programa_formulario');
const base = (process.env.PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
if (base && (!/^https?:\/\//.test(base) || new URL(base).origin !== base)) throw new Error('PUBLIC_API_BASE_URL debe ser un origen, sin rutas ni credenciales.');
await mkdir('dist', { recursive: true });
for (const item of ['index.html', 'css', 'assets', 'libs']) await cp(resolve(source, item), resolve('dist', item), { recursive: true });
await mkdir('dist/js', { recursive: true });
for (const file of ['api.js', 'history.js', 'react-app.js']) {
  execFileSync(process.execPath, ['--check', resolve(source, 'js', file)]);
  await cp(resolve(source, 'js', file), resolve('dist/js', file));
}
await writeFile('dist/config.js', `window.APP_CONFIG = ${JSON.stringify({ apiBaseUrl: base }).replace(/</g, '\\u003c')};\n`);
console.log('Frontend estático validado y generado en dist/.');
