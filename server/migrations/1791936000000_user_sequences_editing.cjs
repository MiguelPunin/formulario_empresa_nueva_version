exports.up = pgm => pgm.sql(`
  LOCK TABLE reports IN ACCESS EXCLUSIVE MODE;
  DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM reports GROUP BY owner_id,upper(number) HAVING count(*)>1) THEN
      RAISE EXCEPTION 'Existen números históricos que coinciden en mayúsculas. Revisa esos registros antes de migrar.';
    END IF;
  END $$;
    ALTER TABLE reports DISABLE TRIGGER protect_confirmed_report;
    ALTER TABLE reports DISABLE TRIGGER assign_report_number;
    ALTER TABLE reports DROP CONSTRAINT reports_number_key;
    CREATE TABLE report_counters (
      owner_id uuid PRIMARY KEY REFERENCES users(id), last_value bigint NOT NULL CHECK(last_value>=0)
    );
    CREATE TABLE report_number_reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
      document_id uuid NOT NULL, sequence bigint, number text NOT NULL CHECK(number=upper(number)),
      consumed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,document_id), UNIQUE(owner_id,sequence), UNIQUE(owner_id,number)
    );
    ALTER TABLE reports ADD COLUMN number_reservation uuid UNIQUE REFERENCES report_number_reservations(id);

    ALTER TABLE reports ADD COLUMN original_number text;
    UPDATE reports SET original_number=number,number=upper(number),
      payload=payload || jsonb_build_object('reportNumber',upper(number),'documentId',COALESCE(payload->>'documentId',id::text),
        'signatures', jsonb_build_object('tecnico','','cliente','','adicional','') || payload->'signatures',
        'signatureMeta', jsonb_build_object('tecnico',NULL,'cliente',NULL,'adicional',NULL) || COALESCE(payload->'signatureMeta','{}'::jsonb)),
      status=CASE WHEN COALESCE(payload->'signatures'->>'cliente','')<>'' THEN 'confirmed' ELSE 'draft' END;
    -- Keep historical authorization hashes and identity snapshots as audit evidence.
    CREATE UNIQUE INDEX reports_owner_number_key ON reports(owner_id,number);
    INSERT INTO report_counters(owner_id,last_value)
      SELECT owner_id,COALESCE(max(substring(number from '([0-9]+)$')::bigint),0) FROM reports GROUP BY owner_id;
    INSERT INTO report_number_reservations(owner_id,document_id,number,consumed)
      SELECT owner_id,id,number,true FROM reports;
    ALTER TABLE reports ENABLE TRIGGER protect_confirmed_report;
    ALTER TABLE reports ENABLE TRIGGER assign_report_number;
    ALTER TABLE reports ADD CONSTRAINT reports_upper_number CHECK(number=upper(number));
    CREATE OR REPLACE FUNCTION assign_report_number() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      NEW.number := upper(NEW.payload->>'reportNumber');
      IF NEW.number IS NULL OR NEW.number='' THEN RAISE EXCEPTION 'Report number required' USING ERRCODE='23514'; END IF;
      IF TG_OP='INSERT' AND NOT EXISTS (SELECT 1 FROM report_number_reservations r
        WHERE r.id=NEW.number_reservation AND r.owner_id=NEW.owner_id AND r.number=NEW.number
        AND r.document_id=(NEW.payload->>'documentId')::uuid AND NOT r.consumed) THEN
        RAISE EXCEPTION 'Reserved report number required' USING ERRCODE='23514';
      END IF;
      IF NEW.status IS DISTINCT FROM (CASE WHEN COALESCE(NEW.payload->'signatures'->>'cliente','')<>'' THEN 'confirmed' ELSE 'draft' END) THEN
        RAISE EXCEPTION 'Status must match client signature' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE OR REPLACE FUNCTION protect_confirmed_report() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='DELETE' THEN
        IF OLD.expires_at<=now() OR OLD.owner_id::text=current_setting('app.delete_report_owner',true) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Report deletion requires owner or expiration' USING ERRCODE='23514';
      END IF;
      IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
        OR NEW.number IS DISTINCT FROM OLD.number OR NEW.number_reservation IS DISTINCT FROM OLD.number_reservation
        OR NEW.original_number IS DISTINCT FROM OLD.original_number
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.request_id IS DISTINCT FROM OLD.request_id
        OR NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.serial_number IS DISTINCT FROM OLD.serial_number
        OR NEW.payload->>'documentId' IS DISTINCT FROM OLD.payload->>'documentId' THEN
        RAISE EXCEPTION 'Report identity is immutable' USING ERRCODE='23514';
      END IF;
      IF OLD.status='confirmed' THEN
        IF NEW.status<>'confirmed' OR NEW.customer IS DISTINCT FROM OLD.customer OR NEW.report_date IS DISTINCT FROM OLD.report_date
          OR (NEW.payload #- '{signatures,adicional}' #- '{signatureMeta,adicional}') IS DISTINCT FROM
             (OLD.payload #- '{signatures,adicional}' #- '{signatureMeta,adicional}')
          OR COALESCE(OLD.payload->'signatures'->>'adicional','')<>''
          OR COALESCE(NEW.payload->'signatures'->>'adicional','')=''
          OR NOT EXISTS (SELECT 1 FROM signature_authorizations a WHERE a.id=(NEW.payload->'signatureMeta'->'adicional'->>'authorizationId')::uuid
            AND a.report_id=OLD.id AND a.owner_id=OLD.owner_id AND a.role='adicional' AND a.signed_at IS NOT NULL AND a.accepted_at IS NOT NULL)
          OR NEW.payload->'signatureMeta'->'adicional' IS NULL OR NEW.payload->'signatureMeta'->'adicional'='null'::jsonb THEN
          RAISE EXCEPTION 'Approved report only accepts its pending additional signature' USING ERRCODE='23514';
        END IF;
      END IF;
      RETURN NEW;
    END $$;

`);
exports.down = () => { throw new Error('Conservar numeración e historial mediante una migración nueva.'); };
