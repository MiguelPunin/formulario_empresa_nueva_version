import { importSigners } from '../server/signer-admin.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { deleteExpiredReports } from '../server/retention.js';
import { migrate } from '../server/migrate.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/password.js';
import { payloadSchema } from '../server/validation.js';
// This suite fails rather than silently replacing PostgreSQL with an in-memory mock.
if (!process.env.TEST_DATABASE_URL) throw new Error('Configura TEST_DATABASE_URL con una base de pruebas PostgreSQL.');
const schema = 'test_' + randomBytes(8).toString('hex');
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let pool, server, base, config, tokenA, tokenB, tokenOther, saved, draft;
const password = randomBytes(24).toString('hex');
const payload = () => ({ schemaVersion: 1, brandId: 'pharmadial', repuestosEnabled: false,
  form: { unidadSoporte: 'Biomédica', cliente: 'Hospital prueba', fecha: '2026-09-27', ciudad: 'Quito', areaSolicitante: 'UCI', telefono: '123', actividad: ['Revisión'], condicion: 'Funcional', falla: 'Técnica', actividadRealizada: 'Revisión monitor', horaInicio: '23:30', horaFinal: '00:30', firstTimeFix: 'Sí', estadoFinal: 'Habilitado', tecnico: 'Técnico de prueba', observaciones: 'Sin novedad' },
  equipoRows: [{ descripcion: 'Monitor', marca: 'Prueba', modelo: 'M1', serie: 'SER123', ubicacion: 'UCI' }],
  repuestoRows: [{ serie: '', parte: '', descripcion: '', cantidad: '' }], signatures: { tecnico: '', cliente: '' },
});
async function request(path, method = 'GET', body, token = tokenA) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${schema},public`);
  await migrate(url.toString(), schema);
  await migrate(url.toString(), schema); // repeatable, versioned migration
  pool = new pg.Pool({ connectionString: url.toString() });
  config = { username: 'test-user', passwordHash: await hashPassword(password), displayName: 'Tests', signerCodePepper: randomBytes(32).toString('hex'), origins: ['http://localhost:3000'], sessionHours: 12 };
  await pool.query('INSERT INTO users(username,full_name,support_initials,password_hash) VALUES($1,$2,$3,$4),($5,$6,$7,$4)', [config.username, 'Tests', 'TS', config.passwordHash, 'second-user', 'Second User', 'SU']);
  await importSigners(pool, [{ key: 'test-signer', name: 'Test Signer', identification: 'PENDIENTE', title: 'Ing.', code: 'test-code', active: true, demo: true }], config.signerCodePepper);
  server = createApp(pool, config).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
});
test('API requires real authentication; two devices share one account', async () => {
  assert.equal((await request('/reports', 'GET', null, '')).status, 401);
  assert.equal((await request('/auth/login', 'POST', { user: config.username, password: 'invalid' }, '')).status, 401);
  const a = await request('/auth/login', 'POST', { user: config.username, password }, '');
  const other = await request('/auth/login', 'POST', { user: 'second-user', password }, '');
  tokenOther = other.data.token;
  const b = await request('/auth/login', 'POST', { user: config.username, password }, '');
  assert.equal(other.data.user.siglas, 'SU');
  assert.equal(a.data.user.siglas, 'TS');
  assert.equal('password_hash' in a.data.user, false);
  tokenA = a.data.token; tokenB = b.data.token; assert.notEqual(tokenA, tokenB); assert.equal(a.status, 200);
  assert.equal((await request('/auth/me')).data.user, config.username);
});
test('creation, concurrent retries and distinct simultaneous saves are atomic', async () => {
  const body = { requestId: randomUUID(), payload: payload() };
  const retries = await Promise.all(Array.from({ length: 5 }, () => request('/reports', 'POST', body)));
  retries.forEach(r => assert.equal(r.status, 201));
  assert.equal(new Set(retries.map(r => r.data.id)).size, 1); saved = retries[0].data;
  const distinct = await Promise.all(Array.from({ length: 5 }, () => request('/reports', 'POST', { requestId: randomUUID(), payload: payload() })));
  assert.equal(new Set(distinct.map(r => r.data.number)).size, 5);
  const conflict = await request('/reports', 'POST', { ...body, payload: { ...body.payload, brandId: 'mancheno' } });
  assert.equal(conflict.status, 409);
});
test('second device reads exact saved snapshot and searches without SQL injection', async () => {
  const detail = await request('/reports/' + saved.id, 'GET', null, tokenB);
  assert.deepEqual(detail.data.payload, payload());
  const result = await request('/reports?q=SER123&from=2026-09-27&to=2026-09-27&status=confirmed', 'GET', null, tokenB);
  assert.equal(result.data.total, 6);
  assert.equal((await request('/reports?q=' + encodeURIComponent("' OR 1=1 --"))).data.total, 0);
  assert.equal((await request('/reports?from=2026-09-28')).data.total, 0);
});
test('duplicate creates persistent new draft, resets visit identity, preserves original', async () => {
  const body = { requestId: randomUUID(), date: '2026-09-28' };
  const copies = await Promise.all([request('/reports/' + saved.id + '/duplicate', 'POST', body), request('/reports/' + saved.id + '/duplicate', 'POST', body)]);
  draft = copies[0].data; assert.equal(copies[0].status, 201); assert.equal(draft.id, copies[1].data.id);
  assert.notEqual(draft.id, saved.id); assert.notEqual(draft.number, saved.number); assert.equal(draft.status, 'draft');
  assert.equal(draft.payload.form.horaInicio, ''); assert.equal(draft.payload.form.fecha, '2026-09-28');
  assert.equal(draft.payload.form.unidadSoporte, 'TS');
  assert.deepEqual(draft.payload.signatures, { tecnico: '', cliente: '' });
  assert.deepEqual((await request('/reports/' + saved.id)).data, saved);
  assert.equal((await request('/reports?status=draft', 'GET', null, tokenB)).data.total, 1);
});
test('draft confirmation handles stale versions and simultaneous different edits', async () => {
  const edited = structuredClone(draft.payload); edited.form.observaciones = 'Nueva visita';
  assert.equal((await request('/reports/' + draft.id + '/confirm', 'PATCH', { version: 9, payload: edited })).status, 409);
  const another = structuredClone(edited); another.form.cliente = 'Otro cliente';
  const results = await Promise.all([request('/reports/' + draft.id + '/confirm', 'PATCH', { version: 1, payload: edited }), request('/reports/' + draft.id + '/confirm', 'PATCH', { version: 1, payload: another }, tokenB)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const winner = results.find(r => r.status === 200).data;
  const retry = await request('/reports/' + draft.id + '/confirm', 'PATCH', { version: 1, payload: winner.payload });
  assert.equal(retry.status, 200); assert.equal(retry.data.version, 2);
});
test('confirmed documents cannot be edited or deleted, even directly in the database', async () => {
  const change = payload(); change.form.cliente = 'Alterado';
  assert.equal((await request('/reports/' + saved.id + '/confirm', 'PATCH', { version: 1, payload: change })).status, 409);
  await assert.rejects(pool.query("UPDATE reports SET customer='Alterado' WHERE id=$1", [saved.id]), { code: '23514' });
  await assert.rejects(pool.query('DELETE FROM reports WHERE id=$1', [saved.id]), { code: '23514' });
  assert.equal((await request('/reports/' + saved.id)).data.customer, 'Hospital prueba');
});
test('invalid input, unknown records, pagination and safe errors', async () => {
  const bad = payload(); bad.form.fecha = '2026-02-30'; assert.equal(payloadSchema.safeParse(bad).success, false);
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: bad })).status, 400);
  const secret = payload(); secret.signatures.tecnico = 'data:image/svg+xml,<script/>';
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: secret })).status, 400);
  assert.equal((await request('/reports/' + randomUUID())).status, 404);
  assert.equal((await request('/reports?page=-1')).status, 400);
  assert.equal((await request('/reports?page=2')).data.items.length, 0);
  assert.equal((await request('/reports?from=2026-09-28&to=2026-09-27')).status, 400);
});
test('other users cannot list, read, duplicate, confirm or replay private reports', async () => {
  assert.equal((await request('/reports', 'GET', null, tokenOther)).data.total, 0);
  assert.equal((await request('/reports/' + saved.id, 'GET', null, tokenOther)).status, 404);
  assert.equal((await request('/reports/' + saved.id + '/duplicate', 'POST', { requestId: randomUUID(), date: '2026-09-28' }, tokenOther)).status, 404);
  assert.equal((await request('/reports/' + saved.id + '/confirm', 'PATCH', { version: 1, payload: saved.payload }, tokenOther)).status, 404);
  const key = (await pool.query('SELECT request_id FROM reports WHERE id=$1', [saved.id])).rows[0].request_id;
  assert.equal((await request('/reports', 'POST', { requestId: key, payload: saved.payload }, tokenOther)).status, 409);
  assert.equal((await request('/reports/' + saved.id)).status, 200);
});

test('14 day retention hides expired content and physically deletes it without deleting newer copies', async () => {
  const owner = (await pool.query('SELECT id FROM users WHERE username=$1', [config.username])).rows[0].id;
  const oldId = randomUUID();
  await pool.query(`INSERT INTO reports(id,customer,report_date,status,payload,payload_hash,request_id,request_hash,owner_id,created_at,expires_at)
    VALUES($1,'Expired',current_date,'confirmed',$2,'test',$3,'test',$4,now()-interval '15 days',now()-interval '1 day')`, [oldId, payload(), randomUUID(), owner]);
  const recentId = randomUUID();
  await pool.query(`INSERT INTO reports(id,customer,report_date,status,payload,payload_hash,request_id,request_hash,owner_id,source_id)
    VALUES($1,'Recent',current_date,'confirmed',$2,'test',$3,'test',$4,$5)`, [recentId, payload(), randomUUID(), owner, oldId]);
  assert.equal((await request('/reports/' + oldId)).status, 404);
  assert.equal((await request('/reports?q=Expired')).data.total, 0);
  assert.equal((await request('/reports/' + oldId + '/duplicate', 'POST', { requestId: randomUUID(), date: '2026-09-28' })).status, 404);
  assert.equal(await deleteExpiredReports(pool), 1);
  assert.equal((await pool.query('SELECT id FROM reports WHERE id=$1', [oldId])).rowCount, 0);
  assert.equal((await request('/reports/' + recentId)).status, 200);
  assert.equal(await deleteExpiredReports(pool), 0);
});

test('data survives application restart; logout affects only its own session', async () => {
  await new Promise(resolve => server.close(resolve));
  server = createApp(pool, config).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await request('/reports/' + saved.id, 'GET', null, tokenB)).data.number, saved.number);
  assert.equal((await request('/auth/logout', 'POST')).status, 204);
  assert.equal((await request('/reports')).status, 401);
  assert.equal((await request('/reports', 'GET', null, tokenB)).status, 200);
});
test('CORS rejects unknown origins and expired sessions cannot read reports', async () => {
  const denied = await fetch(base + '/api/reports', { headers: { Origin: 'https://untrusted.example', Authorization: 'Bearer ' + tokenB } });
  assert.equal(denied.status, 403);
  const allowed = await fetch(base + '/api/reports', { headers: { Origin: 'http://localhost:3000', Authorization: 'Bearer ' + tokenB } });
  assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  await pool.query("UPDATE sessions SET expires_at=now() - interval '1 minute'");
  assert.equal((await request('/reports', 'GET', null, tokenB)).status, 401);
});
test('database failures produce a safe error without connection strings', async () => {
  const broken = createApp({ query: async () => { throw new Error('secret connection string'); } }, config).listen(0, '127.0.0.1');
  await new Promise(resolve => broken.once('listening', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + broken.address().port + '/api/health');
    assert.equal(response.status, 503); assert.equal((await response.text()).includes('secret'), false);
  } finally { await new Promise(resolve => broken.close(resolve)); }
});


const pngSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function freshToken() {
  const login = await request('/auth/login', 'POST', { user: config.username, password }, '');
  return login.data.token;
}
const signable = () => ({ ...payload(), documentId: randomUUID(), signatureMeta: { tecnico: null, cliente: null } });
async function authorize(content, token, role = 'cliente') {
  const validated = await request('/signers/validate', 'POST', { code: 'test-code', role, payload: content }, token);
  assert.equal(validated.status, 200);
  const id = validated.data.authorizationId;
  assert.equal((await request('/signers/authorizations/' + id + '/accept', 'POST', { accepted: true }, token)).status, 200);
  const signed = await request('/signers/authorizations/' + id + '/sign', 'POST', { signature: pngSignature, payload: content }, token);
  assert.equal(signed.status, 200);
  content.signatures[role] = signed.data.signature;
  content.signatureMeta[role] = signed.data.metadata;
  return id;
}

test('catalog is persistent and contains initial institutions', async () => {
  const token = await freshToken();
  const result = await request('/institutions', 'GET', null, token);
  assert.deepEqual(result.data.items.map(i => i.code).sort(), ['CM','HDLV','HV','HVQ']);
});

test('signer validation, inactivity, mandatory acceptance, foreign owner and expired grants', async () => {
  const token = await freshToken(), content = signable();
  const bad = await request('/signers/validate', 'POST', { code: 'wrong', role: 'cliente', payload: content }, token);
  assert.equal(bad.status, 403); assert.equal(JSON.stringify(bad.data).includes('Test Signer'), false);
  await pool.query("UPDATE authorized_signers SET active=false WHERE external_key='test-signer'");
  const inactive = await request('/signers/validate', 'POST', { code: 'test-code', role: 'cliente', payload: content }, token);
  assert.deepEqual(inactive, bad);
  await pool.query("UPDATE authorized_signers SET active=true WHERE external_key='test-signer'");
  const validated = await request('/signers/validate', 'POST', { code: 'test-code', role: 'cliente', payload: content }, token);
  assert.equal(validated.status, 200);
  assert.equal(JSON.stringify(validated.data).includes('code_hash'), false);
  const route = '/signers/authorizations/' + validated.data.authorizationId;
  assert.equal((await request(route + '/sign', 'POST', { signature: pngSignature, payload: content }, token)).status, 403);
  assert.equal((await request(route + '/accept', 'POST', { accepted: false }, token)).status, 400);
  const outsider = (await request('/auth/login', 'POST', { user: 'second-user', password }, '')).data.token;
  assert.equal((await request(route + '/accept', 'POST', { accepted: true }, outsider)).status, 403);
  const accepted = await Promise.all([1,2].map(() => request(route + '/accept', 'POST', { accepted: true }, token)));
  assert.equal(accepted[0].data.acceptedAt, accepted[1].data.acceptedAt);
  await pool.query("UPDATE signature_authorizations SET expires_at=now()-interval '1 minute' WHERE id=$1", [validated.data.authorizationId]);
  assert.equal((await request(route + '/sign', 'POST', { signature: pngSignature, payload: content }, token)).status, 403);
});

test('authorized signatures retain historical identity, clear on duplication and reject reuse or changes', async () => {
  const token = await freshToken(), content = signable();
  await authorize(content, token, 'cliente'); await authorize(content, token, 'tecnico');
  const forgedBeforeSave = structuredClone(content); forgedBeforeSave.signatureMeta.cliente.signerIdentification = 'FORGED';
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: forgedBeforeSave }, token)).status, 400);
  const swapped = structuredClone(content); swapped.signatureMeta.cliente = swapped.signatureMeta.tecnico;
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: swapped }, token)).status, 400);
  const body = { requestId: randomUUID(), payload: content };
  const saved = await request('/reports', 'POST', body, token); assert.equal(saved.status, 201);
  const retry = await request('/reports', 'POST', body, token); assert.equal(retry.data.id, saved.data.id);
  const forged = structuredClone(content); forged.signatureMeta.cliente.signerName = 'Forged';
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: forged }, token)).status, 400);
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token)).status, 400);
  await pool.query("UPDATE authorized_signers SET name='Updated identity',identification='DEMO-UPDATED' WHERE external_key='test-signer'");
  const historic = await request('/reports/' + saved.data.id, 'GET', null, token);
  assert.equal(historic.data.payload.signatureMeta.cliente.signerName, 'Test Signer');
  assert.equal(historic.data.payload.signatureMeta.cliente.signerIdentification, 'PENDIENTE');
  const copy = await request('/reports/' + saved.data.id + '/duplicate', 'POST', { requestId: randomUUID(), date: '2026-10-03' }, token);
  assert.equal(copy.status, 201); assert.notEqual(copy.data.payload.documentId, content.documentId);
  assert.deepEqual(copy.data.payload.signatures, { tecnico: '', cliente: '' });
  assert.deepEqual(copy.data.payload.signatureMeta, { tecnico: null, cliente: null });
  const bypass = structuredClone(copy.data.payload); bypass.signatures = content.signatures; bypass.signatureMeta = content.signatureMeta;
  assert.equal((await request('/reports/' + copy.data.id + '/confirm', 'PATCH', { version: 1, payload: bypass }, token)).status, 400);
  await authorize(copy.data.payload, token);
  const changed = structuredClone(copy.data.payload); changed.form.observaciones = 'Changed after signing';
  assert.equal((await request('/reports/' + copy.data.id + '/confirm', 'PATCH', { version: 1, payload: changed }, token)).status, 400);
  const confirmed = await request('/reports/' + copy.data.id + '/confirm', 'PATCH', { version: 1, payload: copy.data.payload }, token);
  assert.equal(confirmed.status, 200); assert.equal(confirmed.data.payload.signatureMeta.cliente.signerName, 'Updated identity');
});

test('unsigned reports remain supported but raw images without authorization cannot be saved', async () => {
  const token = await freshToken(), content = signable();
  content.signatures.cliente = pngSignature;
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token)).status, 400);
  content.signatures.cliente = '';
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token)).status, 201);
});


test('signature retry is idempotent and backend failure does not enable signing', async () => {
  const token = await freshToken(), content = signable();
  const grant = await authorize(content, token);
  const repeat = await request('/signers/authorizations/' + grant + '/sign', 'POST', { signature: pngSignature, payload: content }, token);
  assert.equal(repeat.status, 200); assert.deepEqual(repeat.data.metadata, content.signatureMeta.cliente);
  const changed = structuredClone(content); changed.form.cliente = 'Changed';
  assert.equal((await request('/signers/authorizations/' + grant + '/sign', 'POST', { signature: pngSignature, payload: changed }, token)).status, 403);
  const unreliable = { query: (...args) => {
    if (args[0].includes('FROM authorized_signers')) throw new Error('private DB failure');
    return pool.query(...args);
  } };
  const broken = createApp(unreliable, config).listen(0,'127.0.0.1');
  await new Promise(resolve => broken.once('listening',resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + broken.address().port + '/api/signers/validate', {
      method: 'POST', headers: { 'Content-Type':'application/json', Authorization:'Bearer '+token },
      body: JSON.stringify({ code:'test-code',role:'cliente',payload:content }) });
    assert.equal(response.status,503); const data = await response.json();
    assert.equal('authorizationId' in data,false); assert.equal(JSON.stringify(data).includes('private DB'),false);
  } finally { await new Promise(resolve => broken.close(resolve)); }
});


test('custom report numbers persist, reject collisions and can change on a duplicate draft', async () => {
  const login = await request('/auth/login', 'POST', { user: config.username, password }, '');
  const token = login.data.token;
  const custom = { ...payload(), reportNumber: 'MANUAL-0042' };
  const created = await request('/reports', 'POST', { requestId: randomUUID(), payload: custom }, token);
  assert.equal(created.status, 201);
  assert.equal(created.data.number, 'MANUAL-0042');
  assert.equal((await request('/reports/' + created.data.id, 'GET', null, token)).data.number, 'MANUAL-0042');
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: custom }, token)).status, 400);
  const copy = await request('/reports/' + created.data.id + '/duplicate', 'POST', { requestId: randomUUID(), date: '2026-10-04' }, token);
  assert.equal(copy.status, 201);
  assert.notEqual(copy.data.number, custom.reportNumber);
  const confirmed = await request('/reports/' + copy.data.id + '/confirm', 'PATCH', { version: copy.data.version, payload: { ...copy.data.payload, reportNumber: 'MANUAL-0043' } }, token);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.number, 'MANUAL-0043');
});
