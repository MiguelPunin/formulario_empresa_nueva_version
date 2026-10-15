import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { migrate } from '../server/migrate.js';
import { reserveNumber } from '../server/report-numbering.js';
import { deleteExpiredReports } from '../server/retention.js';

test('Quito assignments reuse existing identities and preserve credentials and signature snapshots', async () => {
  const schema='responsibles_'+randomBytes(8).toString('hex');
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
    await runner({databaseUrl:url.toString(),dir:fileURLToPath(new URL('../server/migrations',import.meta.url)),schema,migrationsTable:'pgmigrations',direction:'up',count:9,log:()=>{}});
    pool=new pg.Pool({connectionString:url.toString()});
    const jennifer=(await pool.query(`INSERT INTO authorized_signers(external_key,name,identification,title,code_hash,code_lookup)
      VALUES('jennifer-chicango','Jennifer Chicango','DOCUMENTO EXISTENTE','Ing.','existing-hash','existing-lookup') RETURNING id`)).rows[0].id;
    const diego=(await pool.query(`INSERT INTO authorized_signers(external_key,name,institution_id,code_hash,code_lookup)
      SELECT 'manual-existing','Diego Arias',id,NULL,NULL FROM institutions WHERE code='HVQ' RETURNING id`)).rows[0].id;
    const owner=(await pool.query("INSERT INTO users(username,full_name,support_initials,password_hash) VALUES('historic','Historic','HI','test') RETURNING id")).rows[0].id;
    const grant=(await pool.query(`INSERT INTO signature_authorizations(owner_id,signer_id,credential_version,document_id,role,content_hash,signer_snapshot)
      VALUES($1,$2,'historical',$3,'cliente','historical-content','{"signerName":"Identidad histórica","signerTitle":"Ing."}') RETURNING *`,[owner,jennifer,randomUUID()])).rows[0];
    await migrate(url.toString(),schema);await migrate(url.toString(),schema);
    const existing=(await pool.query('SELECT * FROM authorized_signers WHERE id=$1',[jennifer])).rows[0];
    assert.equal(existing.code_hash,'existing-hash');assert.equal(existing.code_lookup,'existing-lookup');assert.equal(existing.identification,'DOCUMENTO EXISTENTE');
    assert.deepEqual((await pool.query('SELECT * FROM signature_authorizations WHERE id=$1',[grant.id])).rows[0],grant);
    const mapped=(await pool.query(`SELECT s.id,s.name,s.treatment,i.code FROM authorized_signers s JOIN institutions i ON i.id=s.institution_id
      WHERE i.code IN ('HDLV','HVQ','HV') ORDER BY s.name`)).rows;
    assert.equal(mapped.length,4);assert.equal(mapped.find(s=>s.name==='Diego Arias').id,diego);
    assert.deepEqual(mapped.map(s=>[s.name,s.treatment,s.code]),[
      ['Diego Arias','Ing.','HVQ'],['Javier Vinueza','Dr.','HV'],['Jennifer Chicango','Ing.','HDLV'],['Milton Chango','Dr.','HVQ']]);
  } finally { await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end(); }
});

test('normalization collision aborts migration without changing historical data', async () => {
  const schema='collision_'+randomBytes(8).toString('hex');
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
    await runner({databaseUrl:url.toString(),dir:fileURLToPath(new URL('../server/migrations',import.meta.url)),schema,migrationsTable:'pgmigrations',direction:'up',count:8,log:()=>{}});
    pool=new pg.Pool({connectionString:url.toString()});
    const owner=(await pool.query("INSERT INTO users(username,full_name,support_initials,password_hash) VALUES('collision','Collision','CL','test') RETURNING id")).rows[0].id;
    for(const number of ['cl.uio.hvq.001','CL.UIO.HVQ.001']) {
      await pool.query(`INSERT INTO reports(customer,report_date,status,payload,payload_hash,request_id,request_hash,owner_id)
        VALUES('Historic',current_date,'confirmed',$1,'hash',$2,'request',$3)`,[{reportNumber:number,signatures:{cliente:''}},randomUUID(),owner]);
    }
    await assert.rejects(migrate(url.toString(),schema),/coinciden en mayúsculas/);
    assert.deepEqual((await pool.query('SELECT number FROM reports ORDER BY number')).rows.map(r=>r.number).sort(),['CL.UIO.HVQ.001','cl.uio.hvq.001']);
    assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='reports' AND column_name='original_number'",[schema])).rowCount,0);
    await assert.rejects(pool.query("UPDATE reports SET customer='Changed'"),{code:'23514'});
  } finally { await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end(); }
});

test('migration preserves old reports/signatures, seeds counters, and retention never resets numbers', async () => {
  const schema='migration_'+randomBytes(8).toString('hex');
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
    await runner({databaseUrl:url.toString(),dir:fileURLToPath(new URL('../server/migrations',import.meta.url)),schema,migrationsTable:'pgmigrations',direction:'up',count:8,log:()=>{}});
    pool=new pg.Pool({connectionString:url.toString()});
    const owner=(await pool.query("INSERT INTO users(username,full_name,support_initials,password_hash) VALUES('legacy','Legacy','LG','test') RETURNING id")).rows[0].id;
    const unsigned={reportNumber:'lg.uio.hvq.041',form:{observaciones:'Resultado anterior'},signatures:{tecnico:'',cliente:''}};
    const signed={...unsigned,reportNumber:'lg.gye.omni.042',signatures:{tecnico:'',cliente:'historical-image'}};
    const insert=async(payload,expired=false)=>(await pool.query(`INSERT INTO reports(customer,report_date,status,payload,payload_hash,request_id,request_hash,owner_id,expires_at)
      VALUES('Historic',current_date,'confirmed',$1,'original-hash',$2,'original-request',$3,now()+$4*interval '1 day') RETURNING id`,[payload,randomUUID(),owner,expired?-1:14])).rows[0].id;
    const unsignedId=await insert(unsigned);const signedId=await insert(signed);const expiredId=await insert({...unsigned,reportNumber:'lg.uio.hvq.043'},true);
    const historical=(await pool.query(`INSERT INTO signature_authorizations(owner_id,signer_id,credential_version,document_id,role,content_hash,signer_snapshot,report_id)
      VALUES($1,NULL,'manual-v1',$2,'cliente','original-signed-hash','{"signerName":"Original"}',$3) RETURNING id`,[owner,randomUUID(),signedId])).rows[0].id;
    await migrate(url.toString(),schema);await migrate(url.toString(),schema);
    const rows=(await pool.query('SELECT * FROM reports ORDER BY number')).rows;
    assert.equal(rows.length,3);
    const saved=rows.find(r=>r.id===signedId),draft=rows.find(r=>r.id===unsignedId);
    assert.equal(saved.number,'LG.GYE.OMNI.042');assert.equal(saved.original_number,signed.reportNumber);assert.equal(saved.status,'confirmed');
    assert.equal(saved.payload.signatures.cliente,'historical-image');assert.equal(saved.payload.reportNumber,saved.number);
    assert.equal(draft.status,'draft');assert.equal(draft.payload.form.observaciones,unsigned.form.observaciones);assert.ok(draft.payload.documentId);
    const grant=(await pool.query('SELECT * FROM signature_authorizations WHERE id=$1',[historical])).rows[0];
    assert.equal(grant.content_hash,'original-signed-hash');assert.equal(grant.signer_snapshot.signerName,'Original');
    assert.equal(await reserveNumber(pool,owner,randomUUID(),'LG.CUE.CA.'),'LG.CUE.CA.044');
    assert.equal(await deleteExpiredReports(pool),1);assert.equal((await pool.query('SELECT id FROM reports WHERE id=$1',[expiredId])).rowCount,0);
    assert.equal(await reserveNumber(pool,owner,randomUUID(),'LG.UIO.HVQ.'),'LG.UIO.HVQ.045');
    await assert.rejects(pool.query("UPDATE reports SET payload=jsonb_set(payload,'{form,observaciones}','\"changed\"') WHERE id=$1",[signedId]),{code:'23514'});
  } finally { await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end(); }
});

test('authorized Diego cleanup resets once and preserves other users', async () => {
  const schema='reset_'+randomBytes(8).toString('hex');
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
    await runner({databaseUrl:url.toString(),dir:fileURLToPath(new URL('../server/migrations',import.meta.url)),schema,migrationsTable:'pgmigrations',direction:'up',count:12,log:()=>{}});
    pool=new pg.Pool({connectionString:url.toString()});
    const ids=[];
    for(const username of ['diego.armas','untouched']) {
      const owner=(await pool.query("INSERT INTO users(username,full_name,support_initials,password_hash) VALUES($1,$1,$2,'test') RETURNING id",[username,username==='diego.armas'?'DA':'UT'])).rows[0].id;
      ids.push(owner);const documentId=randomUUID();const number=await reserveNumber(pool,owner,documentId,'DA-UIO-HV-');
      await pool.query(`INSERT INTO reports(owner_id,number_reservation,customer,report_date,status,payload,payload_hash,request_id,request_hash)
        SELECT $1,id,'Test',CURRENT_DATE,'confirmed',$3::jsonb,'test',$4,'test' FROM report_number_reservations WHERE owner_id=$1 AND document_id=$2`,
        [owner,documentId,JSON.stringify({reportNumber:number,documentId,signatures:{cliente:'historical'}}),randomUUID()]);
      await pool.query("INSERT INTO sessions(token_hash,credential_version,expires_at,user_id) VALUES($1,'test',now()+interval '1 hour',$2)",[username,owner]);
    }
    await migrate(url.toString(),schema);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM reports WHERE owner_id=$1',[ids[0]])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM reports WHERE owner_id=$1',[ids[1]])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1',[ids[0]])).rows[0].n,0);
    assert.equal(await reserveNumber(pool,ids[0],randomUUID(),'DA-UIO-HV-'),'DA-UIO-HV-001');
    await migrate(url.toString(),schema);
    assert.equal(await reserveNumber(pool,ids[0],randomUUID(),'DA-GYE-OMNI-'),'DA-GYE-OMNI-002');
    assert.equal(await reserveNumber(pool,ids[1],randomUUID(),'DA-UIO-HV-'),'DA-UIO-HV-002');
  } finally {await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
