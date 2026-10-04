export function readConfig(env = process.env) {
  for (const key of ['DATABASE_URL']) {
    if (!env[key]) throw new Error(`Falta configurar ${key}`);
  }
  if (env.SIGNER_CODE_PEPPER && env.SIGNER_CODE_PEPPER.length < 32) throw new Error('SIGNER_CODE_PEPPER requiere al menos 32 caracteres.');
  const sessionHours = Number(env.SESSION_HOURS || 12);
  if (!Number.isInteger(sessionHours) || sessionHours < 1 || sessionHours > 168) throw new Error('SESSION_HOURS inválido');
  return {
    databaseUrl: env.DATABASE_URL,
    signerCodePepper: env.SIGNER_CODE_PEPPER || '',
    sessionHours, port: Number(env.PORT || 3000),
    origins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
