exports.up = pgm => pgm.sql(`
  CREATE TABLE institutions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
    name text NOT NULL, active boolean NOT NULL DEFAULT true
  );
  INSERT INTO institutions(code,name) VALUES
    ('HDLV','Hospital de los Valles'), ('HVQ','Hospital Vozandes de Quito'),
    ('HV','Clínica Hemovida'), ('CM','Clínica de la Mujer') ON CONFLICT(code) DO NOTHING;
  CREATE TABLE authorized_signers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), external_key text NOT NULL UNIQUE,
    name text NOT NULL, identification text NOT NULL DEFAULT 'PENDIENTE',
    title text NOT NULL DEFAULT '', code_hash text NOT NULL, code_lookup text NOT NULL UNIQUE,
    active boolean NOT NULL DEFAULT true, demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE signature_authorizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
    signer_id uuid NOT NULL REFERENCES authorized_signers(id), credential_version text NOT NULL,
    document_id uuid NOT NULL, role text NOT NULL CHECK(role IN ('tecnico','cliente')),
    content_hash text NOT NULL, signer_snapshot jsonb NOT NULL,
    accepted_at timestamptz, signed_at timestamptz, signature_hash text,
    report_id uuid REFERENCES reports(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX signature_authorizations_expiration ON signature_authorizations(expires_at) WHERE report_id IS NULL;
`);
exports.down = () => { throw new Error('No se eliminan identidades históricas automáticamente.'); };
