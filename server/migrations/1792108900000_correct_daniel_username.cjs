// Rename the same account: its UUID, password, reports and counter remain unchanged.
exports.up = pgm => pgm.sql(`
  UPDATE users SET username='daniel.pucha'
  WHERE username='daniel.puncha';
`);
exports.down = () => { throw new Error('No restaurar el usuario incorrecto.'); };
