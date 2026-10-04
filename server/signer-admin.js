import { hashPassword } from './password.js';
import { codeLookup } from './signers.js';
import { z } from 'zod';

const entry = z.object({
  key: z.string().min(1).max(100), name: z.string().min(1).max(500),
  identification: z.string().min(1).max(500), title: z.string().max(500),
  code: z.string().min(4).max(128), active: z.boolean(), demo: z.boolean(),
}).strict();

export async function importSigners(client, entries, pepper, overwrite = false) {
  if (!pepper || pepper.length < 32) throw new Error('Configura SIGNER_CODE_PEPPER con al menos 32 caracteres aleatorios.');
  const validated = z.array(entry).min(1).parse(entries);
  for (const person of validated) {
    // Update is explicit; routine demo seeding must not reset real identities or keys.
    const conflict = overwrite ? `DO UPDATE SET name=EXCLUDED.name,identification=EXCLUDED.identification,
      title=EXCLUDED.title,code_hash=EXCLUDED.code_hash,code_lookup=EXCLUDED.code_lookup,
      active=EXCLUDED.active,demo=EXCLUDED.demo,updated_at=now()` : 'DO NOTHING';
    await client.query(`INSERT INTO authorized_signers(external_key,name,identification,title,code_hash,code_lookup,active,demo)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(external_key) ${conflict}`,
    [person.key,person.name,person.identification,person.title,await hashPassword(person.code),codeLookup(person.code,pepper),person.active,person.demo]);
  }
}
