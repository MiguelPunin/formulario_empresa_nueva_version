// Correct the account display name without changing login, password or signed history.
exports.up = pgm => pgm.sql(`
  UPDATE users SET full_name='Daniel Pucha'
  WHERE username IN ('daniel.puncha','daniel.pucha') AND full_name='Daniel Puncha';
`);
exports.down = () => { throw new Error('No restaurar el apellido incorrecto.'); };
