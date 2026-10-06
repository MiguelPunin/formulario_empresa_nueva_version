(function () {
  const html = htm.bind(React.createElement);
  const { useState, useEffect, useRef } = React;
  window.ReportHistory = function ReportHistory({ onClose, onOpen, onDuplicate, onDeleted, busy }) {
    const ref = useRef(null);
    const deletingRef = useRef(false);
    const [deleting, setDeleting] = useState(false);
    const [notice, setNotice] = useState('');
    const [filters, setFilters] = useState({ q: '', from: '', to: '', status: '' });
    const [query, setQuery] = useState({ page: 1 });
    const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
      const focused = document.activeElement;
      ref.current.showModal();
      return () => { if (focused?.isConnected) focused.focus(); };
    }, []);
    useEffect(() => {
      const controller = new AbortController();
      setLoading(true); setError('');
      ReportAPI.request('/reports?' + new URLSearchParams(query), { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setResult(data); })
        .catch(err => { if (!controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => controller.abort();
    }, [query, refresh]);
    useEffect(() => {
      const timer = setInterval(() => { if (!document.hidden) setRefresh(n => n + 1); }, 30000);
      return () => clearInterval(timer);
    }, []);
    async function removeReport(row) {
      if (deletingRef.current || !window.confirm(`¿Eliminar el reporte ${row.number} de ${row.customer}? Se eliminarán sus datos y firmas. Esta acción no se puede deshacer.`)) return;
      deletingRef.current = true; setDeleting(true); setError(''); setNotice('');
      try {
        await ReportAPI.request('/reports/' + row.id, { method: 'DELETE' });
        onDeleted?.(row.id);
        setNotice('Reporte ' + row.number + ' eliminado.');
        setQuery(previous => ({ ...previous, page: result.items.length === 1 ? Math.max(1, previous.page - 1) : previous.page }));
      } catch (err) { setError(err.message); }
      finally { deletingRef.current = false; setDeleting(false); }
    }
    const field = name => event => setFilters(prev => ({ ...prev, [name]: event.target.value }));
    return html`<dialog ref=${ref} className="history-dialog" aria-labelledby="history-title"
      onCancel=${e => { e.preventDefault(); if (!busy && !deleting) onClose(); }}>
      <div className="history-heading"><div><h2 id="history-title">Historial de reportes</h2>
        <p>Solo puedes ver tus reportes. Se eliminan 14 días después de guardarlos.</p></div>
        <button className="secondary" disabled=${busy || deleting} onClick=${onClose}>Cerrar</button></div>
      <form className="history-filters" onSubmit=${e => {
        e.preventDefault();
        if (filters.from && filters.to && filters.from > filters.to) { setError('La fecha inicial debe ser anterior a la final.'); return; }
        setQuery({ ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)), page: 1 });
      }}>
        <label>Buscar<input type="search" placeholder="Cliente, número, equipo o texto" maxLength="200" value=${filters.q} onInput=${field('q')} /></label>
        <label>Desde<input type="date" value=${filters.from} onInput=${field('from')} /></label>
        <label>Hasta<input type="date" value=${filters.to} onInput=${field('to')} /></label>
        <label>Estado<select value=${filters.status} onChange=${field('status')}><option value="">Todos</option><option value="confirmed">Confirmado</option><option value="draft">Borrador</option></select></label>
        <button type="submit" disabled=${loading || busy || deleting}>Buscar</button>
        <button type="button" className="secondary" disabled=${loading || busy || deleting} onClick=${() => setRefresh(n => n + 1)}>Actualizar</button>
      </form>
      ${notice && html`<p role="status">${notice}</p>`}
      ${error && html`<p role="alert" className="report-error">${error}</p>`}
      <p role="status">${loading ? 'Cargando historial…' : result.total + ' reportes encontrados'}</p>
      <div className="history-table-wrap"><table className="history-table"><thead><tr>
        <th>Fecha</th><th>Número</th><th>Hospital / Cliente</th><th>Estado</th><th>Acciones</th>
      </tr></thead><tbody>${result.items.map(row => html`<tr key=${row.id}>
        <td data-label="Fecha">${row.date.split('-').reverse().join('/')}</td><td data-label="Número">${row.number}</td>
        <td data-label="Hospital / Cliente">${row.customer}</td>
        <td data-label="Estado">${row.status === 'confirmed' ? 'Confirmado' : 'Borrador'}</td>
        <td data-label="Acciones"><div className="history-actions">
          <button className="secondary" disabled=${busy || deleting || loading} onClick=${() => onOpen(row.id, 'view')}>Ver</button>
          <button className="secondary" disabled=${busy || deleting || loading} onClick=${() => onDuplicate(row.id)}>Duplicar</button>
          ${row.status === 'confirmed' ? html`<button disabled=${busy || deleting || loading} onClick=${() => onOpen(row.id, 'print')}>Imprimir</button>` :
            html`<button disabled=${busy || deleting || loading} onClick=${() => onOpen(row.id, 'edit')}>Continuar borrador</button>`}
          <button className="secondary history-delete" disabled=${busy || deleting || loading} onClick=${() => removeReport(row)}>${deleting ? 'Espera…' : 'Eliminar'}</button>
        </div></td></tr>`)}</tbody></table></div>
      ${!loading && !error && !result.items.length && html`<p>No hay reportes para esta búsqueda.</p>`}
      <div className="history-pagination">
        <button className="secondary" disabled=${loading || busy || deleting || query.page <= 1} onClick=${() => setQuery(prev => ({ ...prev, page: prev.page - 1 }))}>Anterior</button>
        <span>Página ${query.page} de ${Math.max(1, Math.ceil(result.total / 20))}</span>
        <button className="secondary" disabled=${loading || busy || deleting || query.page * 20 >= result.total} onClick=${() => setQuery(prev => ({ ...prev, page: prev.page + 1 }))}>Siguiente</button>
      </div>
    </dialog>`;
  };
})();
