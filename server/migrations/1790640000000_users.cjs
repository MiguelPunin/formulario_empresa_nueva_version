exports.up = pgm => {
  pgm.sql(`CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL UNIQUE CHECK (username = lower(username)),
    full_name text NOT NULL,
    support_initials text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  DELETE FROM sessions;
  ALTER TABLE sessions ADD COLUMN user_id uuid NOT NULL REFERENCES users(id);
  CREATE INDEX sessions_user_id_idx ON sessions(user_id);`);
};
exports.down = () => { throw new Error('No se eliminan cuentas automáticamente.'); };
