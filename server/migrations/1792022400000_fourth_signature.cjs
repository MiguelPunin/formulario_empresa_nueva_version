exports.up = pgm => pgm.sql(`
ALTER TABLE signature_authorizations DROP CONSTRAINT signature_authorizations_role_check;
ALTER TABLE signature_authorizations ADD CONSTRAINT signature_authorizations_role_check CHECK(role IN ('tecnico','cliente','adicional','adicional2'));
    CREATE OR REPLACE FUNCTION protect_confirmed_report() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE signature_role text; added boolean := false;
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
          OR (NEW.payload #- '{signatures,adicional}' #- '{signatureMeta,adicional}' #- '{signatures,adicional2}' #- '{signatureMeta,adicional2}') IS DISTINCT FROM
             (OLD.payload #- '{signatures,adicional}' #- '{signatureMeta,adicional}' #- '{signatures,adicional2}' #- '{signatureMeta,adicional2}') THEN
          RAISE EXCEPTION 'Approved content is immutable' USING ERRCODE='23514';
        END IF;
        FOREACH signature_role IN ARRAY ARRAY['adicional','adicional2'] LOOP
          IF COALESCE(OLD.payload->'signatures'->>signature_role,'')<>'' THEN
            IF NEW.payload->'signatures'->signature_role IS DISTINCT FROM OLD.payload->'signatures'->signature_role
              OR NEW.payload->'signatureMeta'->signature_role IS DISTINCT FROM OLD.payload->'signatureMeta'->signature_role THEN
              RAISE EXCEPTION 'Existing signature is immutable' USING ERRCODE='23514';
            END IF;
          ELSIF COALESCE(NEW.payload->'signatures'->>signature_role,'')<>'' THEN
            IF NOT EXISTS (SELECT 1 FROM signature_authorizations a WHERE a.id=(NEW.payload->'signatureMeta'->signature_role->>'authorizationId')::uuid
              AND a.report_id=OLD.id AND a.owner_id=OLD.owner_id AND a.role=signature_role AND a.signed_at IS NOT NULL AND a.accepted_at IS NOT NULL) THEN
              RAISE EXCEPTION 'Additional signature requires authorization' USING ERRCODE='23514';
            END IF;
            added := true;
          ELSIF COALESCE(NEW.payload->'signatureMeta'->signature_role,'null'::jsonb)<>'null'::jsonb THEN
            RAISE EXCEPTION 'Identity requires signature' USING ERRCODE='23514';
          END IF;
        END LOOP;
        IF NOT added THEN RAISE EXCEPTION 'Only pending additional signatures may be appended' USING ERRCODE='23514'; END IF;
      END IF;
      RETURN NEW;
    END $$;

`);
exports.down = () => { throw new Error('Preservar firmas mediante una migración nueva.'); };
