// Client-confirmed assignments. Reuse existing identities and preserve credentials/history.
exports.up = pgm => pgm.sql(`
  DO $$
  DECLARE person record; institution uuid; signer uuid;
  BEGIN
    FOR person IN SELECT * FROM (VALUES
      ('jennifer-chicango','Jennifer','Chicango','Ing.','HDLV'),
      ('diego-arias','Diego','Arias','Ing.','HVQ'),
      ('milton-chango','Milton','Chango','Dr.','HVQ'),
      ('javier-vinueza','Javier','Vinueza','Dr.','HV')
    ) AS people(external_key,first_name,last_name,treatment,code) LOOP
      SELECT id INTO STRICT institution FROM institutions WHERE code=person.code;
      SELECT id INTO signer FROM authorized_signers
        WHERE external_key=person.external_key OR
          (lower(btrim(name))=lower(person.first_name || ' ' || person.last_name)
            AND (institution_id=institution OR institution_id IS NULL))
        ORDER BY (external_key=person.external_key) DESC,
          (institution_id=institution) DESC NULLS LAST,created_at,id LIMIT 1;
      IF signer IS NULL THEN
        INSERT INTO authorized_signers(external_key,institution_id,name,identification,title,treatment,
          first_name,last_name,city,code_hash,code_lookup,active,demo)
        VALUES(person.external_key,institution,person.first_name || ' ' || person.last_name,'PENDIENTE',
          person.treatment,person.treatment,person.first_name,person.last_name,'Quito',NULL,NULL,true,false);
      ELSE
        UPDATE authorized_signers SET institution_id=institution,name=person.first_name || ' ' || person.last_name,
          title=person.treatment,treatment=person.treatment,first_name=person.first_name,last_name=person.last_name,
          city='Quito',active=true,updated_at=now() WHERE id=signer;
      END IF;
    END LOOP;
  END $$;
`);
exports.down = () => { throw new Error('Conservar responsables y firmas históricas mediante una migración nueva.'); };
