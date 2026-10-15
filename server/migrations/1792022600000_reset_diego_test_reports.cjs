// One-time cleanup explicitly authorized by the account owner on 2026-10-15.
exports.up = pgm => pgm.sql(`
  DO $$ DECLARE account_id uuid; BEGIN
    SELECT id INTO account_id FROM users WHERE username='diego.armas' FOR UPDATE;
    IF account_id IS NULL THEN RETURN; END IF;
    PERFORM set_config('app.delete_report_owner',account_id::text,true);
    DELETE FROM reports WHERE owner_id=account_id;
    DELETE FROM signature_authorizations WHERE owner_id=account_id;
    DELETE FROM report_number_reservations WHERE owner_id=account_id;
    INSERT INTO report_counters(owner_id,last_value) VALUES(account_id,0)
      ON CONFLICT(owner_id) DO UPDATE SET last_value=0;
    DELETE FROM sessions WHERE user_id=account_id;
  END $$;
`);
exports.down = () => { throw new Error('La limpieza autorizada no debe repetirse ni revertirse automáticamente.'); };
