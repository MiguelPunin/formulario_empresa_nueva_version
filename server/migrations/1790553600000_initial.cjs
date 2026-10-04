exports.up = pgm => pgm.sql(`
  CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    credential_version text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX sessions_expiration ON sessions(expires_at);
  CREATE TABLE reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    number text GENERATED ALWAYS AS ('RS-' || lpad(serial_number::text, greatest(6,length(serial_number::text)), '0')) STORED UNIQUE,
    customer text NOT NULL,
    report_date date NOT NULL,
    status text NOT NULL CHECK(status IN ('draft','confirmed')),
    payload jsonb NOT NULL CHECK(jsonb_typeof(payload) = 'object'),
    payload_hash text NOT NULL,
    source_id uuid REFERENCES reports(id),
    request_id uuid NOT NULL UNIQUE,
    request_hash text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX reports_date ON reports(report_date DESC, created_at DESC);
  CREATE INDEX reports_status ON reports(status);
  CREATE FUNCTION protect_confirmed_report() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.status = 'confirmed' THEN
      RAISE EXCEPTION 'Confirmed reports are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_confirmed_report BEFORE UPDATE OR DELETE ON reports
    FOR EACH ROW EXECUTE FUNCTION protect_confirmed_report();
`);
exports.down = () => { throw new Error('Migración irreversible: conserva el historial y utiliza una migración nueva.'); };
