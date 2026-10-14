const fail = message => Object.assign(new Error(message), { status: 409, publicMessage: message });
export async function reserveNumber(pool, ownerId, documentId, prefix) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize this user's allocations, including retries for the same document.
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [ownerId]);
    const existing = await client.query('SELECT number,consumed FROM report_number_reservations WHERE owner_id=$1 AND document_id=$2', [ownerId,documentId]);
    if (existing.rowCount) {
      if (existing.rows[0].consumed) throw fail('Este documento ya fue guardado. Ábrelo desde el historial.');
      await client.query('COMMIT'); return existing.rows[0].number;
    }
    const counter = await client.query(`INSERT INTO report_counters(owner_id,last_value) VALUES($1,1)
      ON CONFLICT(owner_id) DO UPDATE SET last_value=report_counters.last_value+1 RETURNING last_value`, [ownerId]);
    const sequence = counter.rows[0].last_value;
    const number = prefix.toUpperCase() + String(sequence).padStart(3,'0');
    await client.query('INSERT INTO report_number_reservations(owner_id,document_id,sequence,number) VALUES($1,$2,$3,$4)', [ownerId,documentId,sequence,number]);
    await client.query('COMMIT'); return number;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function requireNumber(client, ownerId, payload) {
  const result = await client.query(`SELECT id FROM report_number_reservations WHERE owner_id=$1 AND document_id=$2
    AND number=$3 AND NOT consumed FOR UPDATE`, [ownerId,payload.documentId,payload.reportNumber]);
  if (!result.rowCount) throw fail('Reserva el número automático antes de guardar o firmar.');
  return result.rows[0].id;
}
