(function () {
  let token = '';
  const base = (window.APP_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
  async function request(path, { method = 'GET', body, signal } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(base + '/api' + path, {
        method, signal: controller.signal, cache: 'no-store',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status === 204) return null;
      const data = await response.json().catch(() => ({ error: 'El servidor no está configurado o no respondió correctamente.' }));
      if (!response.ok) {
        if (response.status === 401 && path !== '/auth/login') {
          token = ''; window.dispatchEvent(new Event('session-expired'));
        }
        throw Object.assign(new Error(data.error || 'No se pudo completar la solicitud.'), { status: response.status });
      }
      return data;
    } catch (error) {
      if (error.status) throw error;
      throw new Error('No se pudo contactar con el servidor. Revisa tu conexión y vuelve a intentar; no cierres el reporte abierto.');
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
  }
  window.ReportAPI = {
    request,
    async login(user, password) { const data = await request('/auth/login', { method: 'POST', body: { user, password } }); token = data.token; return data.user; },
    async logout() { await request('/auth/logout', { method: 'POST' }); token = ''; },
  };
})();
