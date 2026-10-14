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
const pngSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('atomic persistent sequence belongs to each user across cities, clients and retries', async () => {
  const documentId = randomUUID();
  const repeated = await Promise.all(Array.from({ length: 5 }, () => request('/reports/number','POST',{documentId,prefix:'ts.uio.hvq.'})));
  repeated.forEach(r => assert.equal(r.status,200));
  assert.deepEqual(new Set(repeated.map(r=>r.data.number)),new Set(['TS.UIO.HVQ.001']));
  const next = await signable(tokenA,'TS.GYE.OMNI.'); assert.equal(next.reportNumber,'TS.GYE.OMNI.002');
  const other = await signable(tokenOther,'SU.CUE.CA.'); assert.equal(other.reportNumber,'SU.CUE.CA.001');
  const simultaneous = await Promise.all(Array.from({length:6},()=>signable()));
  assert.equal(new Set(simultaneous.map(p=>p.reportNumber)).size,6);
  assert.deepEqual(simultaneous.map(p=>Number(p.reportNumber.split('.').at(-1))).sort((a,b)=>a-b),[3,4,5,6,7,8]);
  const lower = { ...next, reportNumber: next.reportNumber.toLowerCase() };
  const body={requestId:randomUUID(),payload:lower};
  const saves=await Promise.all(Array.from({length:3},()=>request('/reports','POST',body)));
  saves.forEach(r=>assert.equal(r.status,201,JSON.stringify(r.data)));
  assert.equal(new Set(saves.map(r=>r.data.id)).size,1); saved=saves[0].data;
  assert.equal(saved.number,'TS.GYE.OMNI.002'); assert.equal(saved.payload.reportNumber,saved.number);
  assert.equal(saved.status,'draft');
  assert.equal((await request('/reports','POST',{...body,payload:{...lower,brandId:'mancheno'}})).status,409);
  assert.equal((await request('/reports','POST',{requestId:randomUUID(),payload:payload()})).status,409);
});

test('editing keeps record and number, persists every Results field and detects concurrent edits', async () => {
  const original = await request('/reports/'+saved.id,'GET',null,tokenB);
  const edited=structuredClone(original.data.payload);
  Object.assign(edited.form,{horaInicio:'08:15',horaFinal:'10:45',firstTimeFix:'No',estadoFinal:'No habilitado',tecnico:'Responsable',observaciones:'Resultado persistente'});
  const changedNumber={...edited,reportNumber:'TS.UIO.HVQ.999'};
  assert.equal((await request('/reports/'+saved.id,'PATCH',{version:1,payload:changedNumber})).status,409);
  const competing=structuredClone(edited);competing.form.observaciones='Otro dispositivo';
  const results=await Promise.all([request('/reports/'+saved.id,'PATCH',{version:1,payload:edited}),request('/reports/'+saved.id,'PATCH',{version:1,payload:competing},tokenB)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winner=results.find(r=>r.status===200).data;
  assert.equal(winner.id,saved.id);assert.equal(winner.number,saved.number);assert.equal(winner.status,'draft');
  assert.deepEqual((await request('/reports/'+saved.id,'GET',null,tokenB)).data.payload.form,winner.payload.form);
  assert.equal((await request('/reports/'+saved.id,'PATCH',{version:1,payload:winner.payload})).status,200);
  assert.equal((await request('/reports?q='+encodeURIComponent("' OR 1=1 --"))).data.total,0);
  assert.equal((await request('/reports?status=draft')).data.items.find(r=>r.id===saved.id).number,saved.number);
});

test('technical identity is authenticated and does not lock the report', async () => {
  const content=await signable();await authorize(content,tokenA,'tecnico');
  assert.equal(content.signatureMeta.tecnico.signerName,'Tests');
  const created=await request('/reports','POST',{requestId:randomUUID(),payload:content});
  assert.equal(created.status,201);assert.equal(created.data.status,'draft');
  const edited=structuredClone(created.data.payload);edited.form.observaciones='Cambio después de firma técnica';
  assert.equal((await request('/reports/'+created.data.id,'PATCH',{version:1,payload:edited})).status,400);
  edited.signatures.tecnico='';edited.signatureMeta.tecnico=null;
  assert.equal((await request('/reports/'+created.data.id,'PATCH',{version:1,payload:edited})).status,200);
});

test('client alone locks API and database; only one pending additional signature can be appended', async () => {
  const content=await signable();await authorize(content,tokenA);
  const created=await request('/reports','POST',{requestId:randomUUID(),payload:content});
  assert.equal(created.status,201,JSON.stringify(created.data));const row=created.data;assert.equal(row.status,'confirmed');
  const altered=structuredClone(row.payload);altered.form.observaciones='Alterado';
  assert.equal((await request('/reports/'+row.id,'PATCH',{version:row.version,payload:altered})).status,409);
  await assert.rejects(pool.query("UPDATE reports SET customer='Alterado' WHERE id=$1",[row.id]),{code:'23514'});
  await assert.rejects(pool.query("UPDATE reports SET payload=jsonb_set(payload,'{form,observaciones}','\"Alterado\"') WHERE id=$1",[row.id]),{code:'23514'});
  const withTechnical=structuredClone(row.payload);await authorize(withTechnical,tokenA,'tecnico');
  assert.equal((await request('/reports/'+row.id,'PATCH',{version:1,payload:withTechnical})).status,409);
  const extra=structuredClone(row.payload);await authorize(extra,tokenA,'adicional');
  const appended=await request('/reports/'+row.id,'PATCH',{version:1,payload:extra});
  assert.equal(appended.status,200,JSON.stringify(appended.data));assert.equal(appended.data.version,2);
  assert.deepEqual(appended.data.payload.form,row.payload.form);
  assert.deepEqual(appended.data.payload.signatureMeta.cliente,row.payload.signatureMeta.cliente);
  assert.equal((await request('/reports/'+row.id,'PATCH',{version:1,payload:extra})).status,200);
  const replacement=structuredClone(extra);await authorize(replacement,tokenA,'adicional');
  assert.equal((await request('/reports/'+row.id,'PATCH',{version:2,payload:replacement})).status,409);
  assert.equal((await request('/reports/'+row.id,'PATCH',{version:2,payload:row.payload})).status,409);
});

test('private history, disabled duplication, deletion and non-reusable numbers', async () => {
  const content=await signable();const created=await request('/reports','POST',{requestId:randomUUID(),payload:content});
  const id=created.data.id;
  assert.equal((await request('/reports/'+id,'GET',null,tokenOther)).status,404);
  assert.equal((await request('/reports/'+id,'PATCH',{version:1,payload:content},tokenOther)).status,404);
  assert.equal((await request('/reports/'+id,'DELETE',null,tokenOther)).status,404);
  assert.equal((await request('/reports/'+id+'/duplicate','POST',{requestId:randomUUID(),date:'2026-10-14'})).status,410);
  await assert.rejects(pool.query('DELETE FROM reports WHERE id=$1',[id]),{code:'23514'});
  assert.equal((await request('/reports/'+id,'DELETE')).status,204);
  assert.equal((await request('/reports/'+id)).status,404);
  assert.equal((await request('/reports/number','POST',{documentId:content.documentId,prefix:'TS.UIO.HVQ.'})).status,409);
  const next=await signable();assert.ok(Number(next.reportNumber.split('.').at(-1))>Number(content.reportNumber.split('.').at(-1)));
});

test('saved results and counters survive restart; logout and CORS preserve isolation', async () => {
  const before=(await request('/reports/'+saved.id)).data;
  await new Promise(resolve=>server.close(resolve));
  server=createApp(pool,config).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  base='http://127.0.0.1:'+server.address().port;
  assert.deepEqual((await request('/reports/'+saved.id,'GET',null,tokenB)).data,before);
  const next=await signable();assert.ok(Number(next.reportNumber.split('.').at(-1))>8);
  const denied=await fetch(base+'/api/reports',{headers:{Origin:'https://untrusted.example',Authorization:'Bearer '+tokenB}});assert.equal(denied.status,403);
  const temporary=(await request('/auth/login','POST',{user:config.username,password},'')).data.token;
  assert.equal((await request('/auth/logout','POST',null,temporary)).status,204);
  assert.equal((await request('/reports','GET',null,temporary)).status,401);
  assert.equal((await request('/reports','GET',null,tokenB)).status,200);
});

test('validation rejects invalid dates and active content images without exposing infrastructure', async () => {
  const content=await signable();content.form.fecha='2026-02-30';
  assert.equal((await request('/reports','POST',{requestId:randomUUID(),payload:content})).status,400);
  content.form.fecha='2026-10-14';content.signatures.cliente='data:image/svg+xml,<script/>';
  assert.equal((await request('/reports','POST',{requestId:randomUUID(),payload:content})).status,400);
  assert.equal((await request('/reports?page=-1')).status,400);
  const broken=createApp({query:async()=>{throw new Error('secret connection string');}},config).listen(0,'127.0.0.1');
  await new Promise(resolve=>broken.once('listening',resolve));
  try { const response=await fetch('http://127.0.0.1:'+broken.address().port+'/api/health');assert.equal(response.status,503);assert.equal((await response.text()).includes('secret'),false); }
  finally { await new Promise(resolve=>broken.close(resolve)); }
});
async function freshToken() {
  const login = await request('/auth/login', 'POST', { user: config.username, password }, '');
  return login.data.token;
}
async function signable(token = tokenA, prefix = 'TS.UIO.HVQ.') {
  const content = { ...payload(), documentId: randomUUID(), signatureMeta: { tecnico: null, cliente: null, adicional: null } };
  const response = await request('/reports/number','POST',{ documentId: content.documentId, prefix },token);
  assert.equal(response.status,200,JSON.stringify(response.data)); content.reportNumber = response.data.number;
  return content;
}
async function authorize(content, token, role = 'cliente') {
  const validated = role === 'tecnico' || role === 'adicional'
    ? await request('/signers/manual','POST',{ role,payload:content,name:'Untrusted name' },token)
    : await request('/signers/validate', 'POST', { code: 'test-code', role, payload: content }, token);
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
  assert.deepEqual(result.data.items.map(i => i.code).sort(), ['CA','CM','CSJ','CU','HA','HAP','HDEC','HDLV','HLV','HMS','HRG','HSF','HV','HVQ','INC','KPOLI','OMNI','UEES']);
});

test('signer validation, inactivity, mandatory acceptance, foreign owner and expired grants', async () => {
  const token = await freshToken(), content = await signable(token);
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


test('unsigned reports remain supported but raw images without authorization cannot be saved', async () => {
  const token = await freshToken(), content = await signable(token);
  content.signatures.cliente = pngSignature;
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token)).status, 400);
  content.signatures.cliente = '';
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token)).status, 201);
});


test('signature retry is idempotent and backend failure does not enable signing', async () => {
  const token = await freshToken(), content = await signable(token);
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



test('manual optional technical and additional signatures persist without codes', async () => {
  const token = await freshToken(), content = await signable(token);
  assert.equal((await request('/signers/settings', 'GET', null, token)).data.requireSignatureCode, false);
  for (const role of ['tecnico', 'adicional']) {
    const identity = role === 'tecnico' ? { name: 'Persona manual', identification: '1234567890', title: 'Ing.' } : {};
    const grant = await request('/signers/manual', 'POST', { role, payload: content, ...identity }, token);
    assert.equal(grant.status, 200, JSON.stringify(grant.data));
    const route = '/signers/authorizations/' + grant.data.authorizationId;
    assert.equal((await request(route + '/sign', 'POST', { signature: pngSignature, payload: content }, token)).status, 403);
    await request(route + '/accept', 'POST', { accepted: true }, token);
    const signed = await request(route + '/sign', 'POST', { signature: pngSignature, payload: content }, token);
    assert.equal(signed.status, 200);
    assert.equal(signed.data.metadata.signerId, null);
    assert.equal(signed.data.metadata.signerName, role === 'tecnico' ? 'Tests' : '');
    content.signatures[role] = signed.data.signature;
    content.signatureMeta[role] = signed.data.metadata;
  }
  const forged = structuredClone(content); forged.signatureMeta.adicional.signerName = 'Cambio';
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: forged }, token)).status, 400);
  const result = await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.deepEqual((await request('/reports/' + result.data.id, 'GET', null, token)).data.payload, content);
  config.requireSignatureCode = true;
  try {
    assert.equal((await request('/signers/manual', 'POST', { role: 'cliente', payload: await signable(token) }, token)).status, 403);
  } finally { config.requireSignatureCode = false; }
});

test('client signers are isolated by institution and the no-code flow stores an immutable identity snapshot', async () => {
  const token = await freshToken();
  const catalog = (await request('/institutions', 'GET', null, token)).data.items;
  const omni = catalog.find(item => item.code === 'OMNI'), clinic = catalog.find(item => item.code === 'CA');
  const omniPeople = await request(`/institutions/${omni.id}/signers`, 'GET', null, token);
  const clinicPeople = await request(`/institutions/${clinic.id}/signers`, 'GET', null, token);
  assert.equal(omniPeople.data.items.length, 4);
  assert.equal(clinicPeople.data.items.length, 1);
  assert.ok(omniPeople.data.items.every(person => !clinicPeople.data.items.some(other => other.id === person.id)));

  const content = await signable(token); content.form.cliente = `${omni.name} (${omni.code})`;
  const signer = omniPeople.data.items[0];
  const input = { institutionId: omni.id, signerId: signer.id, identification: 'ID escrito manualmente, sin formato nacional', payload: content };
  const crossInstitution = await request('/signers/authorize-client', 'POST', { ...input, institutionId: clinic.id }, token);
  assert.equal(crossInstitution.status, 400);
  const authorized = await request('/signers/authorize-client', 'POST', input, token);
  assert.equal(authorized.status, 200);
  assert.equal(authorized.data.signer.signerIdentification, input.identification);
  assert.equal(authorized.data.signer.signerInstitutionId, omni.id);
  assert.equal(JSON.stringify(authorized.data).includes('code_hash'), false);
  const route = `/signers/authorizations/${authorized.data.authorizationId}`;
  assert.equal((await request(route + '/accept', 'POST', { accepted: true }, token)).status, 200);
  const signed = await request(route + '/sign', 'POST', { signature: pngSignature, payload: content }, token);
  assert.equal(signed.status, 200);
  content.signatures.cliente = signed.data.signature; content.signatureMeta.cliente = signed.data.metadata;
  const saved = await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token);
  assert.equal(saved.status, 201);
  await pool.query('UPDATE authorized_signers SET name=$2,treatment=$3 WHERE id=$1', [signer.id, 'Changed master name', 'Dr.']);
  const historic = await request('/reports/' + saved.data.id, 'GET', null, token);
  assert.equal(historic.data.payload.signatureMeta.cliente.signerName, signer.name);
  assert.equal(historic.data.payload.signatureMeta.cliente.signerTreatment, signer.treatment);
  assert.equal(historic.data.payload.signatureMeta.cliente.signerIdentification, input.identification);
});

test('a new responsible can be added permanently to its institution and signed without code', async () => {
  const token = await freshToken();
  const catalog = (await request('/institutions', 'GET', null, token)).data.items;
  const institution = catalog.find(item => item.code === 'CA');
  const created = await request(`/institutions/${institution.id}/signers`, 'POST', {
    treatment: 'Lic.', firstName: 'Persona', lastName: 'Nueva',
  }, token);
  assert.equal(created.status, 201);
  assert.equal(created.data.name, 'Persona Nueva');
  const content = await signable(token);
  content.form.cliente = `${institution.name} (${institution.code})`;
  const deniedByFlag = config.requireSignatureCode;
  config.requireSignatureCode = true;
  assert.equal((await request('/signers/authorize-client', 'POST', { institutionId: institution.id, signerId: created.data.id, identification: 'abc', payload: content }, token)).status, 403);
  config.requireSignatureCode = deniedByFlag;
  const available = await request(`/institutions/${institution.id}/signers`, 'GET', null, token);
  assert.ok(available.data.items.some(person => person.id === created.data.id));
  const grant = await request('/signers/authorize-client', 'POST', { institutionId: institution.id, signerId: created.data.id,
    identification: 'Documento digitado al firmar', payload: content }, token);
  assert.equal(grant.status, 200);
  const route = `/signers/authorizations/${grant.data.authorizationId}`;
  assert.equal((await request(route + '/accept', 'POST', { accepted: true }, token)).status, 200);
  const signed = await request(route + '/sign', 'POST', { signature: pngSignature, payload: content }, token);
  assert.equal(signed.status, 200);
  content.signatures.cliente = signed.data.signature; content.signatureMeta.cliente = signed.data.metadata;
  const saved = await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token);
  assert.equal(saved.status, 201);
  assert.equal(saved.data.payload.signatureMeta.cliente.signerName, 'Persona Nueva');
  assert.equal(saved.data.payload.signatureMeta.cliente.signerIdentification, 'Documento digitado al firmar');
});


test('empty institutions, optional document, foreign/inactive signers and client bypass', async () => {
  const token = await freshToken();
  const catalog = (await request('/institutions', 'GET', null, token)).data.items;
  const institution = catalog.find(i => i.code === 'CM');
  assert.deepEqual((await request(`/institutions/${institution.id}/signers`, 'GET', null, token)).data.items, []);
  const person = (await request(`/institutions/${institution.id}/signers`, 'POST', { firstName: 'Sin', lastName: 'Documento' }, token)).data;
  const content = await signable(token); content.form.cliente = institution.code;
  const body = { institutionId: institution.id, signerId: person.id, payload: content };
  assert.equal((await request('/signers/manual', 'POST', { role: 'cliente', payload: content }, token)).status, 400);
  const other = catalog.find(i => i.code === 'OMNI');
  const otherPerson = (await request(`/institutions/${other.id}/signers`, 'GET', null, token)).data.items[0];
  assert.equal((await request('/signers/authorize-client', 'POST', { ...body, signerId: otherPerson.id }, token)).status, 409);
  assert.equal((await request('/signers/authorize-client', 'POST', body, '')).status, 401);
  const grant = await request('/signers/authorize-client', 'POST', body, token);
  assert.equal(grant.status, 200);
  const route = `/signers/authorizations/${grant.data.authorizationId}`;
  const outsider = (await request('/auth/login', 'POST', { user: 'second-user', password }, '')).data.token;
  assert.equal((await request(route + '/accept', 'POST', { accepted: true }, outsider)).status, 403);
  await request(route + '/accept', 'POST', { accepted: true }, token);
  const signed = await request(route + '/sign', 'POST', { signature: pngSignature, payload: content }, token);
  content.signatures.cliente = signed.data.signature; content.signatureMeta.cliente = signed.data.metadata;
  assert.equal(content.signatureMeta.cliente.signerIdentification, '');
  const changed = structuredClone(content); changed.form.cliente = other.name;
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: changed }, token)).status, 400);
  assert.equal((await request('/reports', 'POST', { requestId: randomUUID(), payload: content }, token)).status, 201);
  await pool.query('UPDATE authorized_signers SET active=false WHERE id=$1', [person.id]);
  assert.equal((await request('/signers/authorize-client', 'POST', body, token)).status, 409);
});
