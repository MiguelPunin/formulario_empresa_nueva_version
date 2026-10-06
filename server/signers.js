import { createHash, createHmac } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { verifyPassword, hashPassword } from './password.js';
import { payloadSchema, signature } from './validation.js';

export const acceptanceText = 'Al firmar este documento, declaro que he revisado la información contenida en el presente Reporte de Servicio y acepto y estoy de acuerdo con su contenido.';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const codeLookup = (code, pepper) => createHmac('sha256', pepper).update(code).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const contentHash = payload => {
  const { signatures, signatureMeta, ...content } = payload;
  return digest(JSON.stringify(canonical(content)));
};
const fail = (message, status = 403) => Object.assign(new Error(message), { status, publicMessage: message });
const invalid = () => fail('No se pudo validar la clave ingresada. Verifique la información e intente nuevamente.');
function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw fail('Revisa los datos del reporte y completa cliente y fecha antes de autorizar la firma.', 400);
  return result.data;
}
const meta = row => ({ authorizationId: row.id, ...row.signer_snapshot, accepted: true,
  acceptedAt: row.accepted_at.toISOString(), signedAt: row.signed_at.toISOString() });

export function registerSignerRoutes(app, pool, config) {
  const dummy = hashPassword('unavailable-signer-' + Date.now());
  app.get('/api/signers/settings', (req, res) => res.json({ requireSignatureCode: Boolean(config.requireSignatureCode) }));
  app.post('/api/signers/manual', async (req, res) => {
    if (config.requireSignatureCode) throw fail('La firma requiere código. Vuelve a abrir la firma.');
    const optionalText = z.string().trim().max(500).default('');
    const data = parse(z.object({ role: z.enum(['tecnico','cliente','adicional']), payload: payloadSchema,
      name: optionalText, identification: optionalText, title: optionalText }).strict(), req.body);
    if (!data.payload.documentId) throw fail('Inicia un nuevo reporte antes de firmar.', 400);
    const snapshot = { signerId: null, signerName: data.name, signerIdentification: data.identification,
      signerTitle: data.title, demo: false, acceptanceText };
    const grant = await pool.query(`INSERT INTO signature_authorizations(owner_id,signer_id,credential_version,document_id,role,content_hash,signer_snapshot)
      VALUES($1,NULL,'manual-v1',$2,$3,$4,$5) RETURNING id`,
    [req.userId, data.payload.documentId, data.role, contentHash(data.payload), snapshot]);
    res.json({ authorizationId: grant.rows[0].id, signer: snapshot });
  });
  app.get('/api/institutions', async (req, res) => {
    const result = await pool.query('SELECT id,code,name FROM institutions WHERE active ORDER BY name');
    res.json({ items: result.rows });
  });
  app.post('/api/signers/validate', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Demasiados intentos de firma. Espera 15 minutos antes de volver a intentar.' },
  }), async (req, res) => {
    const data = parse(z.object({ code: z.string().min(1).max(128), role: z.enum(['tecnico','cliente','adicional']), payload: payloadSchema }).strict(), req.body);
    if (!config.signerCodePepper) throw fail('La autorización de firmas aún no está configurada.', 503);
    if (!data.payload.documentId) throw fail('Inicia un nuevo reporte antes de firmar.', 400);
    const result = await pool.query('SELECT * FROM authorized_signers WHERE code_lookup=$1', [codeLookup(data.code, config.signerCodePepper)]);
    const signer = result.rows[0];
    const valid = await verifyPassword(data.code, signer?.code_hash || await dummy);
    if (!signer?.active || !valid) throw invalid();
    const snapshot = { signerId: signer.id, signerName: signer.name, signerIdentification: signer.identification,
      signerTitle: signer.title, demo: signer.demo, acceptanceText };
    const grant = await pool.query(`INSERT INTO signature_authorizations(owner_id,signer_id,credential_version,document_id,role,content_hash,signer_snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [req.userId, signer.id, digest(signer.code_hash), data.payload.documentId, data.role, contentHash(data.payload), snapshot]);
    res.json({ valid: true, authorizationId: grant.rows[0].id, signer: snapshot });
  });
  async function withGrant(req, operation) {
    const id = parse(z.uuid(), req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT a.*,s.active,s.code_hash FROM signature_authorizations a
        LEFT JOIN authorized_signers s ON s.id=a.signer_id
        WHERE a.id=$1 AND a.owner_id=$2 AND a.expires_at>now() AND a.report_id IS NULL FOR UPDATE OF a`, [id,req.userId]);
      const grant = result.rows[0];
      if (!validCredential(grant, config)) throw fail('La autorización venció o no está disponible. Vuelve a abrir la firma.');
      const output = await operation(client, grant);
      await client.query('COMMIT'); return output;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  app.post('/api/signers/authorizations/:id/accept', async (req, res) => {
    parse(z.object({ accepted: z.literal(true) }).strict(), req.body);
    res.json(await withGrant(req, async (client, grant) => {
      const result = await client.query('UPDATE signature_authorizations SET accepted_at=COALESCE(accepted_at,now()) WHERE id=$1 RETURNING accepted_at', [grant.id]);
      return { accepted: true, acceptedAt: result.rows[0].accepted_at, signer: grant.signer_snapshot };
    }));
  });
  app.post('/api/signers/authorizations/:id/sign', async (req, res) => {
    const data = parse(z.object({ signature: signature.refine(Boolean), payload: payloadSchema }).strict(), req.body);
    res.json(await withGrant(req, async (client, grant) => {
      if (!grant.accepted_at || grant.content_hash !== contentHash(data.payload)) throw fail('Acepta el contenido actual del reporte antes de firmar.');
      const imageHash = digest(data.signature);
      if (grant.signed_at && grant.signature_hash !== imageHash) throw fail('Para cambiar la firma, vuelve a autorizarla.');
      const result = await client.query(`UPDATE signature_authorizations SET signed_at=COALESCE(signed_at,now()),
        signature_hash=$2,expires_at=CASE WHEN signed_at IS NULL THEN now()+interval '24 hours' ELSE expires_at END
        WHERE id=$1 RETURNING *`, [grant.id,imageHash]);
      return { signature: data.signature, metadata: meta(result.rows[0]) };
    }));
  });
}

// Called within the report transaction. The browser cannot manufacture identity or reuse a grant on another report.
function validCredential(row, config) {
  if (!row) return false;
  if (row.credential_version === 'manual-v1') return !config.requireSignatureCode && row.signer_id === null;
  return row.active && row.code_hash && row.credential_version === digest(row.code_hash);
}

export async function verifyReportSignatures(client, ownerId, payload, reportId, config = {}) {
  for (const role of ['tecnico','cliente','adicional']) {
    const image = payload.signatures[role], supplied = payload.signatureMeta?.[role];
    if (!image) { if (supplied) throw fail('La identidad requiere una firma.', 400); continue; }
    if (!supplied || !payload.documentId) throw fail('Cada firma requiere autorización y aceptación. Vuelve a firmar.', 400);
    const result = await client.query(`SELECT a.*,s.active,s.code_hash FROM signature_authorizations a
      LEFT JOIN authorized_signers s ON s.id=a.signer_id WHERE a.id=$1 AND a.owner_id=$2 FOR UPDATE OF a`, [supplied.authorizationId, ownerId]);
    const row = result.rows[0];
    if (!row || !row.signed_at || !row.accepted_at || row.document_id !== payload.documentId || row.role !== role
      || row.content_hash !== contentHash(payload) || row.signature_hash !== digest(image)
      || (row.report_id && row.report_id !== reportId)
      || (!row.report_id && (!validCredential(row, config) || row.expires_at <= new Date()))) {
      throw fail('La firma no autoriza este reporte. Vuelve a autorizar y firmar.', 400);
    }
    if (JSON.stringify(canonical(supplied)) !== JSON.stringify(canonical(meta(row)))) throw fail('La identidad de la firma no coincide con su autorización.', 400);
    await client.query('UPDATE signature_authorizations SET report_id=$2 WHERE id=$1', [row.id,reportId]);
  }
}
