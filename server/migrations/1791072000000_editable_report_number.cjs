exports.up = pgm => pgm.sql(`
  ALTER TABLE reports ALTER COLUMN number DROP EXPRESSION;
  CREATE FUNCTION assign_report_number() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    NEW.number := COALESCE(NULLIF(btrim(NEW.payload->>'reportNumber'), ''),
      'RS-' || lpad(NEW.serial_number::text, greatest(6,length(NEW.serial_number::text)), '0'));
    RETURN NEW;
  END $$;
  CREATE TRIGGER assign_report_number BEFORE INSERT OR UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION assign_report_number();
`);
exports.down = () => { throw new Error('Conserva los números personalizados con una migración nueva.'); };
