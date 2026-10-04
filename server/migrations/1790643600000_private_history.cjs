exports.up = pgm => pgm.sql(`
  ALTER TABLE reports ADD COLUMN owner_id uuid REFERENCES users(id);
  ALTER TABLE reports ADD COLUMN expires_at timestamptz;
  ALTER TABLE reports DISABLE TRIGGER protect_confirmed_report;
  UPDATE reports SET expires_at=created_at + interval '14 days';
  ALTER TABLE reports ENABLE TRIGGER protect_confirmed_report;
  ALTER TABLE reports ALTER COLUMN expires_at SET DEFAULT (now() + interval '14 days');
  ALTER TABLE reports ALTER COLUMN expires_at SET NOT NULL;
  -- Historical source UUID remains even after its original has expired.
  ALTER TABLE reports DROP CONSTRAINT reports_source_id_fkey;
  CREATE INDEX reports_owner_created ON reports(owner_id, created_at DESC);
  CREATE INDEX reports_expiration ON reports(expires_at);
  CREATE OR REPLACE FUNCTION protect_confirmed_report() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.expires_at <= now() THEN RETURN OLD; END IF;
      RAISE EXCEPTION 'Reports may only be deleted after expiration' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'confirmed' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'Report identity and confirmed content are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END $$;
`);
exports.down = () => { throw new Error('No se revierte la privacidad del historial.'); };
