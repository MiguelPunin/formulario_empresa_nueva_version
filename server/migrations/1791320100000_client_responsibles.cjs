const fs = require('node:fs');
const path = require('node:path');

const seedPath = path.resolve(__dirname, '../..', 'scripts/data/client-responsibles.json');
const institutions = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const q = value => `'${String(value).replaceAll("'", "''")}'`;

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE authorized_signers ALTER COLUMN code_hash DROP NOT NULL;
    ALTER TABLE authorized_signers ALTER COLUMN code_lookup DROP NOT NULL;
    ALTER TABLE authorized_signers ADD COLUMN institution_id uuid REFERENCES institutions(id);
    ALTER TABLE authorized_signers ADD COLUMN treatment text NOT NULL DEFAULT '';
    ALTER TABLE authorized_signers ADD COLUMN first_name text NOT NULL DEFAULT '';
    ALTER TABLE authorized_signers ADD COLUMN last_name text NOT NULL DEFAULT '';
    ALTER TABLE authorized_signers ADD COLUMN job_title text NOT NULL DEFAULT '';
    ALTER TABLE authorized_signers ADD COLUMN city text NOT NULL DEFAULT '';
    CREATE INDEX authorized_signers_institution_active ON authorized_signers(institution_id,name) WHERE active;
  `);

  for (const institution of institutions) {
    pgm.sql(`INSERT INTO institutions(code,name) VALUES(${q(institution.code)},${q(institution.name)}) ON CONFLICT(code) DO NOTHING`);
    for (const [index, person] of institution.responsibles.entries()) {
      const name = `${person.firstName} ${person.lastName}`.trim();
      pgm.sql(`INSERT INTO authorized_signers
        (external_key,institution_id,name,identification,title,treatment,first_name,last_name,job_title,city,code_hash,code_lookup,active,demo)
        SELECT ${q(`excel-${institution.code.toLowerCase()}-${index + 1}`)},id,${q(name)},'PENDIENTE',${q(person.treatment)},
          ${q(person.treatment)},${q(person.firstName)},${q(person.lastName)},${q(person.jobTitle)},${q(person.city)},NULL,NULL,true,false
        FROM institutions WHERE code=${q(institution.code)}
        ON CONFLICT(external_key) DO NOTHING`);
    }
  }
};

exports.down = () => { throw new Error('No se eliminan responsables vinculados a firmas históricas automáticamente.'); };
