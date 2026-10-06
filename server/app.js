import { registerSignerRoutes, verifyReportSignatures } from './signers.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { hashPassword, verifyPassword } from './password.js';
import { createSchema, duplicateSchema, finalizeSchema, filtersSchema } from './validation.js';
const digest = value => createHash('sha256').update(value).digest('hex');
const hashPayload = value => digest(JSON.stringify(value));
const webRoot = fileURLToPath(new URL('../formulario/formulario_empresa/programa_formulario/', import.meta.url));
const summaryColumns = 'id, number, customer, report_date::text AS date, status, version, source_id, created_at, updated_at';
function fail(status, message) { return Object.assign(new Error(message), { status, publicMessage: message }); }
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw fail(400, 'Revisa los datos: ' + result.error.issues.map(i => i.path.join('.') || i.message).slice(0, 4).join(', '));
  return result.data;
}
export function createApp(pool, config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use('/api', cors({ origin(origin, callback) {
    if (!origin || config.origins.includes(origin)) callback(null, true);
    else callback(fail(403, 'Origen no autorizado.'));
  }, methods: ['GET', 'POST', 'PATCH'], allowedHeaders: ['Authorization', 'Content-Type'] }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/health', async (req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); });
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const publicUser = u => ({ user: u.username, nombre: u.full_name, siglas: u.support_initials });
  app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' },
  }), async (req, res) => {
    const { user, password } = parse(z.object({ user: z.string().max(200), password: z.string().max(1024) }).strict(), req.body);
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [user.trim().toLowerCase()]);
    const account = result.rows[0];
    const validPassword = await verifyPassword(password, account?.password_hash || await dummyHash);
    if (!account?.active || !validPassword) throw fail(401, 'Usuario o contraseña incorrectos.');
    const credentialVersion = digest(account.username + ':' + account.password_hash);
    const token = randomBytes(32).toString('hex');
    await pool.query('DELETE FROM sessions WHERE expires_at < now()');
    await pool.query("INSERT INTO sessions(token_hash, credential_version, expires_at, user_id) VALUES($1,$2,now() + $3 * interval '1 hour',$4)", [digest(token), credentialVersion, config.sessionHours, account.id]);
    res.json({ token, user: publicUser(account) });
  });
  app.use('/api', async (req, res, next) => {
    const token = req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) throw fail(401, 'Inicia sesión para continuar.');
    const session = await pool.query('SELECT u.* , s.credential_version FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active', [digest(token)]);
    const account = session.rows[0];
    if (!account || account.credential_version !== digest(account.username + ':' + account.password_hash)) throw fail(401, 'Tu sesión expiró. Inicia sesión otra vez; tus cambios abiertos se conservarán mientras no recargues.');
    req.user = publicUser(account);
    req.userId = account.id;
    req.tokenHash = digest(token); next();
  });
  app.post('/api/auth/logout', async (req, res) => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.tokenHash]); res.sendStatus(204);
  });
  app.get('/api/auth/me', (req, res) => res.json(req.user));
  registerSignerRoutes(app, pool, config);
  app.get('/api/reports', async (req, res) => {
    const f = parse(filtersSchema, req.query);
    // Search only report text; signature base64 is intentionally excluded.
    const values = [`%${f.q.replace(/[\\%_]/g, '\\$&')}%`, f.from || null, f.to || null, f.status || null, req.userId];
    const where = `WHERE (number ILIKE $1 OR customer ILIKE $1 OR
      (payload->'form')::text ILIKE $1 OR (payload->'equipoRows')::text ILIKE $1 OR
      (payload->'repuestoRows')::text ILIKE $1)
      AND ($2::date IS NULL OR report_date >= $2) AND ($3::date IS NULL OR report_date <= $3)
      AND ($4::text IS NULL OR status=$4) AND owner_id=$5 AND expires_at>now()`;
    const count = await pool.query(`SELECT count(*)::int AS total FROM reports ${where}`, values);
    const rows = await pool.query(`SELECT ${summaryColumns} FROM reports ${where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $6`, [...values, (f.page - 1) * 20]);
    res.json({ items: rows.rows, total: count.rows[0].total, page: f.page, pageSize: 20 });
  });
  app.get('/api/reports/:id', async (req, res) => {
    const id = parse(z.uuid(), req.params.id);
    const result = await pool.query(`SELECT ${summaryColumns},payload FROM reports WHERE id=$1 AND owner_id=$2 AND expires_at>now()`, [id, req.userId]);
    if (!result.rowCount) throw fail(404, 'El reporte no existe.');
    res.json(result.rows[0]);
  });
  async function insertReport(ownerId, requestId, requestHash, payload, status, sourceId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // The unique request_id makes concurrent retries atomic, including lost responses.
      const inserted = await client.query(`INSERT INTO reports(customer,report_date,status,payload,payload_hash,source_id,request_id,request_hash,owner_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(request_id) DO NOTHING RETURNING ${summaryColumns},payload`,
      [payload.form.cliente, payload.form.fecha, status, payload, hashPayload(payload), sourceId, requestId, requestHash, ownerId]);
      if (inserted.rowCount) {
        await verifyReportSignatures(client, ownerId, payload, inserted.rows[0].id, config);
        await client.query('COMMIT');
        return inserted.rows[0];
      }
      const existing = await client.query(`SELECT ${summaryColumns},payload,request_hash FROM reports WHERE request_id=$1 AND owner_id=$2 AND expires_at>now()`, [requestId, ownerId]);
      if (!existing.rowCount) throw fail(409, 'Solicitud no disponible. Genera una nueva solicitud.');
      if (existing.rows[0].request_hash !== requestHash) throw fail(409, 'Esta solicitud ya se guardó con otros datos. Abre el historial antes de continuar.');
      const { request_hash, ...record } = existing.rows[0];
      await client.query('COMMIT');
      return record;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  app.post('/api/reports', async (req, res) => {
    const data = parse(createSchema, req.body);
    const record = await insertReport(req.userId, data.requestId, hashPayload(data.payload), data.payload, 'confirmed');
    res.status(201).json(record);
  });
  app.post('/api/reports/:id/duplicate', async (req, res) => {
    const id = parse(z.uuid(), req.params.id);
    const data = parse(duplicateSchema, req.body);
    const original = await pool.query('SELECT payload FROM reports WHERE id=$1 AND owner_id=$2 AND expires_at>now()', [id, req.userId]);
    if (!original.rowCount) throw fail(404, 'El reporte original no existe.');
    const payload = structuredClone(original.rows[0].payload);
    delete payload.reportNumber;
    payload.documentId = randomUUID();
    payload.signatures = { tecnico: '', cliente: '' };
    payload.signatureMeta = { tecnico: null, cliente: null };
    payload.form.fecha = data.date;
    payload.form.unidadSoporte = req.user.siglas;
    payload.form.horaInicio = ''; payload.form.horaFinal = '';
    payload.form.firstTimeFix = ''; payload.form.estadoFinal = '';
    res.status(201).json(await insertReport(req.userId, data.requestId, hashPayload({ source: id, date: data.date }), payload, 'draft', id));
  });
  app.patch('/api/reports/:id/confirm', async (req, res) => {
    const id = parse(z.uuid(), req.params.id);
    const data = parse(finalizeSchema, req.body);
    const hash = hashPayload(data.payload);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT status,version,payload_hash FROM reports WHERE id=$1 AND owner_id=$2 AND expires_at>now() FOR UPDATE', [id, req.userId]);
      if (!result.rowCount) throw fail(404, 'El borrador no existe.');
      const previous = result.rows[0];
      if (previous.status === 'confirmed') {
        if (previous.payload_hash !== hash) throw fail(409, 'El reporte ya está confirmado. Duplícalo para realizar cambios.');
      } else {
        if (previous.version !== data.version) throw fail(409, 'El borrador cambió en otro dispositivo. Vuelve a abrirlo desde el historial.');
        await verifyReportSignatures(client, req.userId, data.payload, id, config);
        await client.query(`UPDATE reports SET customer=$2,report_date=$3,payload=$4,payload_hash=$5,status='confirmed',version=version+1,updated_at=now() WHERE id=$1`,
          [id, data.payload.form.cliente, data.payload.form.fecha, data.payload, hash]);
      }
      const saved = await client.query(`SELECT ${summaryColumns},payload FROM reports WHERE id=$1 AND owner_id=$2 AND expires_at>now()`, [id, req.userId]);
      await client.query('COMMIT'); res.json(saved.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  // Same-origin frontend for local use or an all-in-one Render deployment.
  app.get('/config.js', (req, res) => res.type('js').set('Cache-Control', 'no-store').send('window.APP_CONFIG = { apiBaseUrl: "" };'));
  app.use(express.static(webRoot, { etag: true, maxAge: 0 }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'El reporte es demasiado grande. Reduce el contenido o las firmas.' });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'Solicitud inválida.' });
    if (error.code === '23505' && error.constraint === 'reports_number_key') return res.status(400).json({ error: 'Ese número de reporte ya existe. Escribe otro número.' });
    if (error.publicMessage) return res.status(error.status).json({ error: error.publicMessage });
    // Never log connection strings, request bodies, passwords or report content.
    console.error('Request failed', { code: error.code || 'INTERNAL', path: req.path });
    res.status(503).json({ error: 'No se pudo conectar con el servicio de datos. Tus datos abiertos siguen aquí; vuelve a intentar.' });
  });
  return app;
}
