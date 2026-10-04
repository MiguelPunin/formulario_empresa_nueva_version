import { hashPassword } from '../server/password.js';
// Input is hidden and never passed as a shell argument or written to disk.
if (!process.stdin.isTTY) throw new Error('Ejecuta este comando en una terminal interactiva.');
process.stdout.write('Nueva contraseña (mínimo 12 caracteres): ');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
let password = '';
process.stdin.on('data', async chunk => {
  for (const char of chunk) {
    if (char === '\u0003') process.exit(1);
    if (char === '\r' || char === '\n') {
      process.stdin.setRawMode(false); process.stdin.pause();
      if (password.length < 12) { console.error('\nUsa al menos 12 caracteres.'); process.exit(1); }
      console.log('\nAPP_PASSWORD_HASH=' + await hashPassword(password));
      process.exit(0);
    }
    if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
    else password += char;
  }
});
