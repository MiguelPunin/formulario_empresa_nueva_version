exports.up = pgm => pgm.sql(`
  ALTER TABLE signature_authorizations ALTER COLUMN signer_id DROP NOT NULL;
  ALTER TABLE signature_authorizations DROP CONSTRAINT signature_authorizations_role_check;
  ALTER TABLE signature_authorizations ADD CONSTRAINT signature_authorizations_role_check CHECK(role IN ('tecnico','cliente','adicional'));
`);
exports.down = () => { throw new Error('Las firmas históricas deben conservarse.'); };
