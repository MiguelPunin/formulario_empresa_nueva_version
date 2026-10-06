exports.up = pgm => pgm.sql(`
  CREATE OR REPLACE FUNCTION protect_confirmed_report() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.expires_at <= now() OR OLD.owner_id::text = current_setting('app.delete_report_owner', true) THEN RETURN OLD; END IF;
      RAISE EXCEPTION 'Report deletion requires its authenticated owner or expiration' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'confirmed' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'Report identity and confirmed content are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END $$;
`);
exports.down = () => { throw new Error('No se recuperan reportes eliminados mediante una migración.'); };
