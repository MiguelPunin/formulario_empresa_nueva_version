export async function deleteExpiredReports(pool) {
  await pool.query('DELETE FROM signature_authorizations WHERE report_id IS NULL AND expires_at <= now()');
  const result = await pool.query('DELETE FROM reports WHERE expires_at <= now()');
  return result.rowCount;
}

export function startRetention(pool) {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try { await deleteExpiredReports(pool); }
    catch (error) { console.error('Report cleanup failed', { code: error.code || 'DATABASE' }); }
    finally { running = false; }
  };
  const timer = setInterval(sweep, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
