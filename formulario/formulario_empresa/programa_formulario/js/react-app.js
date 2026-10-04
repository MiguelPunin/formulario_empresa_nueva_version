(function () {
  const { useState, useEffect, useRef, useLayoutEffect } = React;
  const html = htm.bind(React.createElement);
  const BRANDS = [
    { id: 'totalcare', name: 'TotalCare Pharma', logo: 'assets/totalcare-pharma.png', colors: 'Azul marino y turquesa' },
    { id: 'pharmadial', name: 'Pharmadial', logo: 'assets/pharmadial.png', colors: 'Azul y blanco' },
    { id: 'mancheno', name: 'Distribuidora Mancheno', logo: 'assets/distribuidora-mancheno.png', colors: 'Negro, gris y blanco' },
  ];

  function BrandPicker({ selected, onSelect, onClose }) {
    const ref = useRef(null);
    useEffect(() => {
      const focused = document.activeElement;
      ref.current.showModal();
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
        if (focused && focused.isConnected) focused.focus();
      };
    }, []);
    return html`<dialog ref=${ref} className="brand-picker" aria-labelledby="brand-title"
      onCancel=${event => { event.preventDefault(); if (selected) onClose(); }}>
      <h2 id="brand-title">¿Qué logo deseas usar?</h2>
      <p>Elige la empresa para este reporte. Su logo y colores se aplicarán también al imprimir.</p>
      <div className="brand-options">
        ${BRANDS.map(brand => html`<button key=${brand.id} type="button" className="brand-option"
          aria-pressed=${selected === brand.id} onClick=${() => onSelect(brand.id)}>
          <img src=${brand.logo} alt="" />
          <strong>${brand.name}</strong><span>${brand.colors}</span>
        </button>`)}
      </div>
      ${selected && html`<button type="button" className="secondary" onClick=${onClose}>Cancelar</button>`}
    </dialog>`;
  }

  const ACTIVITY_OPTIONS = [
    { value: 'Revisión', label: 'Revisión' },
    { value: 'Mantenimiento preventivo', label: 'Mant. preventivo' },
    { value: 'Mantenimiento correctivo', label: 'Mant. correctivo' },
    { value: 'Instalación', label: 'Instalación' },
  ];

  function calculateWorkMinutes(start, end) {
    if (!start || !end) return '';
    const toMinutes = time => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    return (toMinutes(end) - toMinutes(start) + 1440) % 1440;
  }

  function getToday() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  }

  function createInitialEquipoRows() {
    return Array.from({ length: 3 }, () => ({
      descripcion: '',
      marca: '',
      modelo: '',
      serie: '',
      ubicacion: '',
    }));
  }

  function createInitialRepuestoRows() {
    return Array.from({ length: 2 }, () => ({
      serie: '',
      parte: '',
      descripcion: '',
      cantidad: '',
    }));
  }

  function createInitialForm() {
    return {
      unidadSoporte: '',
      cliente: '',
      fecha: getToday(),
      ciudad: '',
      areaSolicitante: '',
      telefono: '',
      actividad: [],
      condicion: '',
      falla: '',
      actividadRealizada: '',
      horaInicio: '',
      horaFinal: '',
      firstTimeFix: '',
      estadoFinal: '',
      tecnico: '',
      observaciones: '',
    };
  }

  function useAutosize(ref, value) {
    useLayoutEffect(() => {
      if (!ref.current) return;
      const element = ref.current;
      const resize = () => {
        element.style.height = '0px';
        element.style.height = element.scrollHeight + 'px';
      };
      resize();
      let width = element.getBoundingClientRect().width;
      const observer = new ResizeObserver(() => {
        const nextWidth = element.getBoundingClientRect().width;
        if (nextWidth !== width) { width = nextWidth; resize(); }
      });
      observer.observe(element);
      window.addEventListener('beforeprint', resize);
      window.addEventListener('afterprint', resize);
      return () => {
        observer.disconnect();
        window.removeEventListener('beforeprint', resize);
        window.removeEventListener('afterprint', resize);
      };
    }, [value, ref]);
  }

  function AutosizeTextarea(props) {
    const { value, onInput, className, rows, placeholder, ariaLabel } = props;
    const textRef = useRef(null);
    useAutosize(textRef, value);

    return html`
      <textarea
        ref=${textRef}
        className=${className}
        value=${value}
        rows=${rows || 1}
        placeholder=${placeholder}
        aria-label=${ariaLabel}
        onInput=${onInput}
      />
    `;
  }

  function LoginOverlay(props) {
    const [showPassword, setShowPassword] = useState(false);
    useEffect(() => { setShowPassword(false); }, [props.visible]);
    const {
      visible,
      loginUser,
      loginPass,
      loginError,
      onUserChange,
      onPassChange,
      onLogin,
      onClear,
    } = props;

    const videoRef = useRef(null);
    const [videoPaused, setVideoPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.defaultPlaybackRate = 0.65;
      video.playbackRate = 0.65;
      if (!visible || videoPaused) video.pause();
      else { video.muted = true; video.play().catch(() => setVideoPaused(true)); }
    }, [visible, videoPaused]);

    return html`
      <div className=${`login-overlay ${visible ? '' : 'hidden'}`} id="loginOverlay">
        ${visible && html`<video ref=${videoRef} className="login-background-video" muted loop playsInline preload="metadata" aria-hidden="true" tabIndex="-1">
          <source src="assets/login-background.mp4" type="video/mp4" />
        </video>`}
        <div className="login-shell">
        <div className="login-intro">
          <div className="login-brand">
          <img className="login-totalcare-logo" src="assets/totalcare-pharma.png" alt="TotalCare Pharma" />
          <div>
          <div className="login-wordmark">REPORTE DE SERVICIO</div>
          <p>Departamento Biomédico</p>
          </div></div>
          <div className="login-presentation">
            <h1>Equipos que<br />mantienen vidas<br /><span>en movimiento</span></h1>
            <p>Gestión de reportes de servicio para el soporte de equipos biomédicos.</p>
            <div className="login-benefits">
              <div><span aria-hidden="true">♡</span><p>Cuidado en<br />cada servicio</p></div>
              <div><span aria-hidden="true">⚒</span><p>Gestión eficiente<br />de reportes</p></div>
              <div><span aria-hidden="true">▥</span><p>Información<br />organizada</p></div>
            </div>
          </div>
          <p className="login-quote">“Equipos en buen estado,<br />para un mejor mañana”</p>
        </div>
        <div className="login-access">
        <p className="login-motto">Tecnología al servicio de la salud</p>
        <div className="login-card">
          <div className="login-card-brand">
            <img className="login-totalcare-logo" src="assets/totalcare-pharma.png" alt="TotalCare Pharma" />
            <div className="login-wordmark">REPORTE DE SERVICIO</div>
            <p>Departamento Biomédico</p>
          </div>
          <div className="login-copy">
            <h2>Bienvenido</h2>
            <p>Ingresa tus datos para comenzar.</p>
          </div>
          <div>
            <label htmlFor="loginUser">Usuario</label>
            <input
              id="loginUser"
              type="text"
              autoComplete="username"
              placeholder="Escribe tu usuario"
              value=${loginUser}
              onInput=${onUserChange}
              onKeyUp=${(e) => { if (e.key === 'Enter') onLogin(); }}
            />
          </div>
          <div>
            <label htmlFor="loginPass">Contraseña</label>
            <div className="login-password-wrap"><input
              id="loginPass"
              type=${showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Escribe tu contraseña"
              value=${loginPass}
              onInput=${onPassChange}
              onKeyUp=${(e) => { if (e.key === 'Enter') onLogin(); }}
            /><button type="button" className="password-toggle" aria-label=${showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed=${showPassword} onClick=${() => setShowPassword(value => !value)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                ${showPassword && html`<path d="M3 3l18 18" />`}
              </svg>
            </button></div>
          </div>
          <div className="login-error" id="loginError" role="status">${loginError}</div>
          <div className="login-actions">
            <button className="secondary" id="loginClear" type="button" onClick=${onClear}>Limpiar</button>
            <button id="loginBtn" type="button" onClick=${onLogin}>Ingresar <span aria-hidden="true">→</span></button>
          </div>
          <p className="login-footnote">Al ingresar podrás elegir la empresa de tu reporte.</p>
        </div>
        <div className="login-mobile-benefits" aria-hidden="true"><span>♡<small>Cuidado</small></span><span>⚒<small>Eficiencia</small></span><span>▥<small>Resultados</small></span></div>
        <p className="login-bottom-motto">Tecnología al servicio de la salud</p>
        </div>
        </div>
      </div>
    `;
  }

  function SignatureAuthorization({ label, role, payload, onSave, onClose }) {
    const dialogRef = useRef(null);
    const active = useRef(true);
    const requestRef = useRef(null);
    const busyRef = useRef(false);
    const [phase, setPhase] = useState('code');
    const [code, setCode] = useState('');
    const [grant, setGrant] = useState(null);
    const [accepted, setAccepted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
      const focused = document.activeElement;
      return () => { active.current = false; requestRef.current?.abort(); if (focused?.isConnected) focused.focus(); };
    }, []);
    useEffect(() => {
      if (phase === 'pad') return;
      dialogRef.current.showModal();
    }, [phase]);
    async function advance(event) {
      event.preventDefault();
      if (busyRef.current || (phase === 'accept' && !accepted)) return;
      busyRef.current = true; setLoading(true); setError('');
      const controller = new AbortController(); requestRef.current = controller;
      try {
        if (phase === 'code') {
          const result = await ReportAPI.request('/signers/validate', { method: 'POST', body: { code, role, payload }, signal: controller.signal });
          if (active.current) { setCode(''); setGrant(result); setPhase('accept'); }
        } else {
          await ReportAPI.request('/signers/authorizations/' + grant.authorizationId + '/accept', {
            method: 'POST', body: { accepted: true }, signal: controller.signal });
          if (active.current) setPhase('pad');
        }
      } catch (err) { if (active.current) setError(err.message); }
      finally { busyRef.current = false; if (active.current) setLoading(false); }
    }
    if (phase === 'pad') return html`<${SignaturePad} label=${label} initialValue="" onClose=${onClose}
      onSave=${async image => {
        const result = await ReportAPI.request('/signers/authorizations/' + grant.authorizationId + '/sign', {
          method: 'POST', body: { signature: image, payload } });
        if (active.current) onSave(result.signature, result.metadata);
      }} />`;
    return html`<dialog ref=${dialogRef} className="signature-dialog authorization-dialog" aria-labelledby="authorization-title"
      onCancel=${event => { event.preventDefault(); onClose(); }}>
      <form onSubmit=${advance}>
        <h2 id="authorization-title">${phase === 'code' ? 'Autorización de firma' : 'Confirmación de firma'}</h2>
        <p>${label}</p>
        ${phase === 'code' ? html`<label className="authorization-code">Ingrese su clave personal para continuar.
          <input type="password" autoComplete="off" maxLength="128" required autoFocus
            value=${code} onInput=${event => setCode(event.target.value)} disabled=${loading} /></label>` : html`
          <div className="signer-identity"><strong>${grant.signer.signerTitle} ${grant.signer.signerName}</strong>
            <span>C.I. ${grant.signer.signerIdentification}</span>
            ${grant.signer.demo && html`<small>DEMO · identificación pendiente de datos definitivos</small>`}</div>
          <p>${grant.signer.acceptanceText}</p>
          <label className="authorization-check"><input type="checkbox" checked=${accepted} disabled=${loading}
            onChange=${event => setAccepted(event.target.checked)} />
            <span>He leído y acepto el contenido del presente reporte.</span></label>`}
        ${error && html`<p role="alert" className="report-error">${error}</p>`}
        <div className="signature-actions">
          <button type="button" className="secondary" onClick=${onClose}>Cancelar</button>
          <button type="submit" disabled=${loading || (phase === 'accept' ? !accepted : !code)}>
            ${loading ? 'Validando…' : phase === 'code' ? 'Continuar' : 'Aceptar y continuar'}</button>
        </div>
      </form>
    </dialog>`;
  }

  function SignaturePad({ label, initialValue, onSave, onClose }) {
    const dialogRef = useRef(null);
    const canvasRef = useRef(null);
    const pointer = useRef(null);
    const fileRef = useRef(null);
    const [imageError, setImageError] = useState('');
    const [importing, setImporting] = useState(false);
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [hasInk, setHasInk] = useState(Boolean(initialValue));

    useEffect(() => {
      const dialog = dialogRef.current;
      const previousFocus = document.activeElement;
      dialog.showModal();
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      let active = true;
      if (initialValue) {
        const image = new Image();
        image.onload = () => {
          if (active) canvasRef.current.getContext('2d').drawImage(image, 0, 0, 900, 300);
        };
        image.src = initialValue;
      }
      return () => {
        active = false;
        document.body.style.overflow = previousOverflow;
        if (previousFocus && previousFocus.isConnected) previousFocus.focus();
      };
    }, []);

    async function importSignature(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setImageError('');
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setImageError('Selecciona una imagen PNG, JPG o WebP.'); return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setImageError('La imagen debe pesar menos de 10 MB.'); return;
      }
      setImporting(true);
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (!canvasRef.current) return;
        const output = document.createElement('canvas');
        output.width = 900; output.height = 300;
        const ctx = output.getContext('2d');
        const scale = Math.min(860 / image.naturalWidth, 260 / image.naturalHeight);
        const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
        ctx.drawImage(image, (900 - width) / 2, (300 - height) / 2, width, height);
        if (output.toDataURL('image/png').length > 500000) {
          throw new Error('La imagen tiene demasiado detalle. Usa un recorte de la firma con fondo sencillo.');
        }
        const target = canvasRef.current.getContext('2d');
        target.clearRect(0, 0, 900, 300);
        target.drawImage(output, 0, 0);
        setHasInk(true);
      } catch (error) {
        setImageError(error.message.startsWith('La imagen tiene') ? error.message : 'No se pudo abrir la imagen. Prueba con un archivo PNG o JPG.');
      } finally { URL.revokeObjectURL(url); setImporting(false); }
    }

    function point(event) {
      const bounds = canvasRef.current.getBoundingClientRect();
      return [(event.clientX - bounds.left) * 900 / bounds.width,
        (event.clientY - bounds.top) * 300 / bounds.height];
    }

    function start(event) {
      if (saving || importing || pointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      const ctx = canvasRef.current.getContext('2d');
      const [x, y] = point(event);
      ctx.strokeStyle = '#142337';
      ctx.fillStyle = '#142337';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y);
      setHasInk(true);
    }

    function move(event) {
      if (pointer.current !== event.pointerId) return;
      event.preventDefault();
      const ctx = canvasRef.current.getContext('2d');
      ctx.lineTo(...point(event)); ctx.stroke();
    }

    function stop(event) {
      if (pointer.current === event.pointerId) pointer.current = null;
    }

    return html`
      <dialog ref=${dialogRef} className="signature-dialog" aria-labelledby="signature-title"
        onCancel=${event => { event.preventDefault(); onClose(); }}>
        <h2 id="signature-title">Firma de ${label}</h2>
        <p>Firma con el dedo o mouse, o carga una imagen guardada. Revisa la vista previa y pulsa Guardar firma.</p>
        <canvas ref=${canvasRef} width="900" height="300" aria-label=${`Área para firmar: ${label}`}
          onPointerDown=${start} onPointerMove=${move} onPointerUp=${stop}
          onPointerCancel=${stop} onLostPointerCapture=${stop} />
        <input ref=${fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange=${importSignature} />
        <p role="status">${importing ? 'Cargando imagen…' : imageError}</p>
        <div className="signature-actions">
          <button type="button" className="secondary" disabled=${importing || saving} onClick=${() => fileRef.current.click()}>Cargar imagen de firma</button>
          <button type="button" className="secondary" disabled=${saving || importing} onClick=${() => {
            canvasRef.current.getContext('2d').clearRect(0, 0, 900, 300);
            setHasInk(false);
          }}>Borrar trazo</button>
          <button type="button" className="secondary" onClick=${onClose}>Cancelar</button>
          <button type="button" disabled=${!hasInk || importing || saving} onClick=${async () => {
            if (savingRef.current) return;
            savingRef.current = true; setSaving(true); setImageError('');
            try { await onSave(canvasRef.current.toDataURL('image/png')); }
            catch (err) { setImageError(err.message); }
            finally { savingRef.current = false; setSaving(false); }
          }}>${saving ? 'Guardando firma…' : 'Guardar firma'}</button>
        </div>
      </dialog>
    `;
  }

  function App() {
    const [brandId, setBrandId] = useState(null);
    const [choosingBrand, setChoosingBrand] = useState(true);
    const brand = BRANDS.find(item => item.id === brandId) || BRANDS[0];
    useLayoutEffect(() => { document.body.dataset.brand = brand.id; }, [brand.id]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loginUser, setLoginUser] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [loginError, setLoginError] = useState('');
    const [reportNumber, setReportNumber] = useState('');
    const [form, setForm] = useState(createInitialForm);
    const [equipoRows, setEquipoRows] = useState(createInitialEquipoRows);
    const [repuestoRows, setRepuestoRows] = useState(createInitialRepuestoRows);
    const [repuestosEnabled, setRepuestosEnabled] = useState(true);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const sheetRef = useRef(null);
    const [signatures, setSignatures] = useState({ tecnico: '', cliente: '' });
    const [signatureTarget, setSignatureTarget] = useState(null);
    const [documentId, setDocumentId] = useState(() => crypto.randomUUID());
    const [signatureMeta, setSignatureMeta] = useState({ tecnico: null, cliente: null });
    const signedContent = useRef(null);
    const [institutions, setInstitutions] = useState([]);
    const [institutionsError, setInstitutionsError] = useState('');
    const [record, setRecord] = useState(null);
    const [readOnly, setReadOnly] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [pendingSave, setPendingSave] = useState(null);
    const busyRef = useRef(false);
    const loginBusy = useRef(false);
    const loggedInBefore = useRef(false);
    const lastUsername = useRef(null);
    const duplicateRequest = useRef(null);
    const snapshot = () => ({ schemaVersion: 1, reportNumber, brandId: brand.id, form, equipoRows, repuestoRows, repuestosEnabled, documentId, signatures, signatureMeta });
    const contentKey = JSON.stringify({ reportNumber, brandId: brand.id, form, equipoRows, repuestoRows, repuestosEnabled, documentId });
    useEffect(() => {
      if (!readOnly && signedContent.current && signedContent.current !== contentKey) {
        setSignatures({ tecnico: '', cliente: '' }); setSignatureMeta({ tecnico: null, cliente: null });
        signedContent.current = null;
        setMessage('El contenido cambió. Autoriza y realiza nuevamente las firmas antes de confirmar.');
      }
    }, [contentKey, readOnly]);
    useEffect(() => {
      if (!currentUser) return;
      const controller = new AbortController();
      setInstitutionsError('');
      ReportAPI.request('/institutions', { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) setInstitutions(data.items);
      }).catch(err => { if (!controller.signal.aborted) setInstitutionsError('No se pudo cargar el catálogo. Puedes escribir el cliente manualmente.'); });
      return () => controller.abort();
    }, [currentUser]);
    const hasUnsaved = !readOnly && (reportNumber || pendingSave || Object.entries(form).some(([key, value]) => key !== 'fecha' && !(key === 'unidadSoporte' && value === currentUser?.siglas) && (Array.isArray(value) ? value.length : value)) ||
      equipoRows.some(row => Object.values(row).some(Boolean)) || repuestoRows.some(row => Object.values(row).some(Boolean)) || Object.values(signatures).some(Boolean));

    useEffect(() => {
      // Remove credentials stored by older releases; report history never uses browser storage.
      try { sessionStorage.removeItem('loggedUser'); } catch (_) { /* Storage can be disabled. */ }
      const expired = () => { setCurrentUser(null); setSignatureTarget(null); setHistoryOpen(false); setLoginError('La sesión expiró. Ingresa de nuevo para continuar con el reporte abierto.'); };
      window.addEventListener('session-expired', expired);
      return () => window.removeEventListener('session-expired', expired);
    }, []);
    useEffect(() => {
      document.body.classList.toggle('authenticated', !!currentUser);
      return () => document.body.classList.remove('authenticated');
    }, [currentUser]);
    useLayoutEffect(() => {
      document.body.classList.toggle('printable-report', !!currentUser && record?.status === 'confirmed');
      return () => document.body.classList.remove('printable-report');
    }, [currentUser, record]);
    useEffect(() => {
      const printShortcut = event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p' && currentUser && !historyOpen && !choosingBrand && !signatureTarget) {
          event.preventDefault(); saveReport(true);
        }
      };
      window.addEventListener('keydown', printShortcut);
      return () => window.removeEventListener('keydown', printShortcut);
    });
    useEffect(() => {
      const warn = event => { if (hasUnsaved) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', warn);
      return () => window.removeEventListener('beforeunload', warn);
    }, [hasUnsaved]);

    function allowReplace() {
      return !hasUnsaved || window.confirm(pendingSave
        ? 'Hay un guardado pendiente de confirmar. Podría estar en el historial. ¿Deseas abandonar esta vista y continuar con otra operación?'
        : 'Los cambios sin guardar se perderán. ¿Deseas continuar?');
    }
    function applyRecord(saved, editable = false) {
      const data = saved.payload;
      setRecord(saved); setReportNumber(saved.number); setBrandId(data.brandId); setChoosingBrand(false);
      setForm(data.form); setEquipoRows(data.equipoRows); setRepuestoRows(data.repuestoRows);
      const nextDocumentId = data.documentId || crypto.randomUUID();
      setDocumentId(nextDocumentId);
      setRepuestosEnabled(data.repuestosEnabled);
      const legacyEditable = editable && saved.status !== 'confirmed' && !data.signatureMeta;
      setSignatures(legacyEditable ? { tecnico: '', cliente: '' } : data.signatures);
      setSignatureMeta(data.signatureMeta || { tecnico: null, cliente: null });
      signedContent.current = JSON.stringify({ reportNumber: saved.number, brandId: data.brandId, form: data.form, equipoRows: data.equipoRows,
        repuestoRows: data.repuestoRows, repuestosEnabled: data.repuestosEnabled, documentId: nextDocumentId });
      setReadOnly(!editable || saved.status === 'confirmed'); setPendingSave(null); setSignatureTarget(null);
    }
    async function printReady(saved = record) {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await document.fonts.ready;
      await Promise.all(Array.from(sheetRef.current.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      downloadPDF(saved);
    }
    async function saveReport(andPrint = false) {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true); setError(''); setMessage('');
      try {
        if (record?.status === 'confirmed') { if (andPrint) await printReady(); return; }
        if (readOnly) throw new Error('Abre el borrador con “Continuar borrador” antes de confirmarlo.');
        if (!form.cliente.trim()) throw new Error('Ingresa el hospital o cliente antes de guardar.');
        if (!form.fecha) throw new Error('Ingresa la fecha del reporte.');
        const operation = pendingSave || { requestId: crypto.randomUUID(), payload: snapshot() };
        setPendingSave(operation);
        const saved = record
          ? await ReportAPI.request('/reports/' + record.id + '/confirm', { method: 'PATCH', body: { version: record.version, payload: operation.payload } })
          : await ReportAPI.request('/reports', { method: 'POST', body: operation });
        ReactDOM.flushSync(() => applyRecord(saved));
        setMessage('Reporte ' + saved.number + ' guardado y confirmado en tu historial.');
        if (andPrint) await printReady(saved);
      } catch (err) {
        if (err.status === 400 || err.status === 413) setPendingSave(null);
        setError(err.message);
      } finally { busyRef.current = false; setBusy(false); }
    }
    async function openReport(id, mode) {
      if (busyRef.current || !allowReplace()) return;
      busyRef.current = true; setBusy(true); setError('');
      try {
        const saved = await ReportAPI.request('/reports/' + id);
        ReactDOM.flushSync(() => { applyRecord(saved, mode === 'edit'); setHistoryOpen(false); setMessage(''); });
        if (mode === 'print') await printReady(saved);
      } catch (err) { setError(err.message); setHistoryOpen(false); }
      finally { busyRef.current = false; setBusy(false); }
    }
    async function duplicateReport(id) {
      if (busyRef.current || !allowReplace()) return;
      busyRef.current = true; setBusy(true); setError('');
      try {
        if (duplicateRequest.current?.id !== id) duplicateRequest.current = { id, requestId: crypto.randomUUID(), date: getToday() };
        const { requestId, date } = duplicateRequest.current;
        const saved = await ReportAPI.request('/reports/' + id + '/duplicate', { method: 'POST', body: { requestId, date } });
        applyRecord(saved, true); setHistoryOpen(false); duplicateRequest.current = null;
        setMessage('Copia ' + saved.number + ' creada como borrador. La copia requiere nuevas claves, aceptación y firmas. Revisa los horarios y resultados de la nueva visita.');
      } catch (err) { setError(err.message); setHistoryOpen(false); }
      finally { busyRef.current = false; setBusy(false); }
    }

    function updateField(field) {
      return (event) => {
        const value = event.target.value;
        setForm(prev => ({ ...prev, [field]: value }));
      };
    }

    function toggleActivity(value) {
      setForm(prev => {
        const exists = prev.actividad.includes(value);
        const next = exists
          ? prev.actividad.filter(item => item !== value)
          : [...prev.actividad, value];
        return { ...prev, actividad: next };
      });
    }

    function updateEquipoRow(index, field) {
      return (event) => {
        const value = event.target.value;
        setEquipoRows(prev => prev.map((row, i) => (
          i === index ? { ...row, [field]: value } : row
        )));
      };
    }

    function updateRepuestoRow(index, field) {
      return (event) => {
        const value = event.target.value;
        setRepuestoRows(prev => prev.map((row, i) => (
          i === index ? { ...row, [field]: value } : row
        )));
      };
    }

    function clearForm(user = currentUser) {
      setDocumentId(crypto.randomUUID()); signedContent.current = null;
      setSignatureMeta({ tecnico: null, cliente: null });
      setRecord(null); setReadOnly(false); setPendingSave(null); setError(''); setMessage('');
      setRepuestosEnabled(true);
      setSignatures({ tecnico: '', cliente: '' });
      setSignatureTarget(null);
      setReportNumber('');
      setForm({ ...createInitialForm(), unidadSoporte: user?.siglas || '' });
      setEquipoRows(createInitialEquipoRows());
      setRepuestoRows(createInitialRepuestoRows());
    }

    async function handleLogin() {
      if (loginBusy.current) return;
      loginBusy.current = true; setLoginError('Conectando…');
      try {
        const user = await ReportAPI.login(loginUser.trim(), loginPass);
        setCurrentUser(user); setLoginPass(''); setLoginError('');
        if (!loggedInBefore.current || lastUsername.current !== user.user) { setBrandId(null); setChoosingBrand(true); clearForm(user); }
        loggedInBefore.current = true;
        lastUsername.current = user.user;
      } catch (err) { setLoginError(err.message); }
      finally { loginBusy.current = false; }
    }

    async function handleLogout() {
      if (!allowReplace()) return;
      try {
        await ReportAPI.logout(); clearForm(); setCurrentUser(null); setHistoryOpen(false);
        loggedInBefore.current = false;
      } catch (err) { setError(err.message); }
    }

    function handleClearLogin() {
      setLoginUser('');
      setLoginPass('');
      setLoginError('');
    }

    function buildFileName(saved) {
      const values = saved?.payload.form || form;
      const num = saved?.number || reportNumber.trim() || 'reporte';
      const date = values.fecha || getToday();
      const cliente = (values.cliente || 'cliente').trim().replace(/[<>:"/\\|?*\s]+/g, '_');
      const user = currentUser ? currentUser.user : 'usuario';
      return num + '_' + cliente + '_' + user + '_' + date + '.pdf';
    }

    function downloadPDF(saved) {
      const element = sheetRef.current;
      if (!element) return;

      const prevTitle = document.title;
      const fileName = buildFileName(saved).replace(/\.pdf$/i, '');
      let cleaned = false;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.title = prevTitle;
        document.body.classList.remove('pdf-mode');
        setPdfGenerating(false);
        window.removeEventListener('afterprint', cleanup);
      };

      setPdfGenerating(true);
      document.body.classList.add('pdf-mode');
      document.title = fileName;
      element.querySelectorAll('textarea').forEach((el) => {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      });

      window.addEventListener('afterprint', cleanup);
      window.print();
      setTimeout(cleanup, 1500);
    }

    function addEquipoRow() {
      setEquipoRows(prev => [...prev, {
        descripcion: '',
        marca: '',
        modelo: '',
        serie: '',
        ubicacion: '',
      }]);
    }

    function removeEquipoRow() {
      setEquipoRows(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
    }

    function addRepuestoRow() {
      setRepuestoRows(prev => [...prev, {
        serie: '',
        parte: '',
        descripcion: '',
        cantidad: '',
      }]);
    }

    function removeRepuestoRow() {
      setRepuestoRows(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
    }

    const userLabel = currentUser ? (currentUser.nombre || currentUser.user) : 'Usuario';

    return html`
      <div>
        <${LoginOverlay}
          visible=${!currentUser}
          loginUser=${loginUser}
          loginPass=${loginPass}
          loginError=${loginError}
          onUserChange=${(e) => { setLoginUser(e.target.value); setLoginError(''); }}
          onPassChange=${(e) => { setLoginPass(e.target.value); setLoginError(''); }}
          onLogin=${handleLogin}
          onClear=${handleClearLogin}
        />

        <p className="print-save-notice">Guarda y confirma el reporte desde la aplicación antes de imprimirlo.</p>
        <div className=${`sheet ${currentUser ? '' : 'hidden'}`} id="sheet" ref=${sheetRef}>
          <div className="sheet-header">
            <div className="title">
              <h1>REPORTE DE SERVICIO</h1>
              <small>Departamento Biomédico</small>
            </div>
            <img className="brand-logo" src=${brand.logo} alt=${brand.name} />
            <div className="report-number">
              <label htmlFor="numeroReporte">Número de reporte</label>
              <input
                id="numeroReporte"
                type="text"
                value=${reportNumber}
                onChange=${event => setReportNumber(event.target.value)}
                maxLength="60"
                readOnly=${readOnly || busy}
                placeholder="Automático al guardar"
              />
            </div>
          </div>

          <div className="toolbar" role="region" aria-label="Usuario y acciones del reporte">
            ${currentUser ? html`
              <div className="user-chip" id="userChip">
                <span className="dot"></span>
                <span id="userNameLabel">${userLabel}</span>
              </div>
            ` : null}
            <div className="spacer"></div>
            <div className="buttons">
              <button className="secondary" disabled=${busy || !!pendingSave || readOnly} type="button" onClick=${() => setChoosingBrand(true)}>Cambiar logo</button>
              <button className="secondary" disabled=${busy} type="button" onClick=${() => setHistoryOpen(true)}>Historial de facturas</button>
              <button className="secondary" disabled=${busy} id="logoutBtn" type="button" onClick=${handleLogout}>Salir</button>
              ${!readOnly && html`<button disabled=${busy} type="button" onClick=${() => saveReport(false)}>${busy ? 'Guardando…' : pendingSave ? 'Reintentar guardado' : 'Guardar reporte'}</button>`}
              <button id="pdfBtn" type="button" disabled=${pdfGenerating || busy || (readOnly && record?.status !== 'confirmed')} onClick=${() => saveReport(true)}>
                ${pdfGenerating ? 'Generando...' : record?.status === 'confirmed' ? 'Descargar PDF' : 'Guardar e imprimir'}
              </button>
              ${record && html`<button className="secondary" disabled=${busy} type="button" onClick=${() => duplicateReport(record.id)}>Duplicar reporte</button>`}
              <button className="secondary" disabled=${busy} id="clearBtn" type="button" onClick=${() => { if (allowReplace()) clearForm(); }}>Nuevo reporte</button>
            </div>
          </div>

          <div className="report-notices">
            ${message && html`<p role="status">${message}</p>`}
            ${error && html`<p role="alert" className="report-error">${error}</p>`}
            ${readOnly && html`<p>Vista protegida · ${record?.status === 'confirmed' ? 'Confirmado' : 'Borrador'}. Para reutilizar los datos, selecciona Duplicar reporte.</p>`}
            ${pendingSave && !busy && html`<p>El guardado aún no está confirmado. Usa Reintentar guardado: no creará un duplicado. Si necesitas corregir datos, revisa primero el historial.</p>`}
          </div>
          <fieldset className="content report-fields" id="report" disabled=${readOnly || busy || !!pendingSave}>
            <div className="grid cols-3 compact-grid">
              <div className="field compact">
                <label>Unidad técnica de soporte</label>
                <input type="text" value=${form.unidadSoporte} onInput=${updateField('unidadSoporte')} />
              </div>
              <div className="field compact">
                <label htmlFor="cliente">Cliente</label>
                <input type="text" id="cliente" list="institutions-list" value=${form.cliente} onInput=${updateField('cliente')} />
                <datalist id="institutions-list">${institutions.map(item => html`<option key=${item.id} value=${item.name + ' (' + item.code + ')'} />`)}</datalist>
                ${institutionsError && html`<small role="status">${institutionsError}</small>`}
              </div>
              <div className="field compact">
                <label>Fecha</label>
                <input type="date" id="fecha" value=${form.fecha} onInput=${updateField('fecha')} />
              </div>
            </div>

            <div className="grid cols-3 compact-grid">
              <div className="field compact">
                <label>Ciudad</label>
                <input type="text" value=${form.ciudad} onInput=${updateField('ciudad')} />
              </div>
              <div className="field compact">
                <label>Área solicitante</label>
                <input type="text" value=${form.areaSolicitante} onInput=${updateField('areaSolicitante')} />
              </div>
              <div className="field compact">
                <label>Teléfono / contacto</label>
                <input type="text" value=${form.telefono} onInput=${updateField('telefono')} />
              </div>
            </div>

            <div className="section">
              <div className="section-header">1. Detalle de la actividad</div>
              <div className="section-body grid cols-3">
                <div>
                  <p style=${{ fontWeight: 600, margin: '0 0 6px' }}>Tipo de actividad a realizar</p>
                  <div className="pill-box">
                    ${ACTIVITY_OPTIONS.map(option => html`
                      <label className="pill" key=${option.value}>
                        <input
                          type="checkbox"
                          value=${option.value}
                          checked=${form.actividad.includes(option.value)}
                          onChange=${() => toggleActivity(option.value)}
                        />
                        ${option.label}
                      </label>
                    `)}
                  </div>
                </div>
                <div>
                  <p style=${{ fontWeight: 600, margin: '0 0 6px' }}>Condición actual del equipo</p>
                  <div className="pill-box">
                    <label className="pill">
                      <input
                        type="radio"
                        name="condicion"
                        value="Funcional"
                        checked=${form.condicion === 'Funcional'}
                        onChange=${updateField('condicion')}
                       />
                      Funcional
                    </label>
                    <label className="pill">
                      <input
                        type="radio"
                        name="condicion"
                        value="No funcional"
                        checked=${form.condicion === 'No funcional'}
                        onChange=${updateField('condicion')}
                       />
                      No funcional
                    </label>
                  </div>
                </div>
                <div>
                  <p style=${{ fontWeight: 600, margin: '0 0 6px' }}>Tipo de falla</p>
                  <div className="pill-box">
                    <label className="pill">
                      <input
                        type="radio"
                        name="falla"
                        value="Operativa externa"
                        checked=${form.falla === 'Operativa externa'}
                        onChange=${updateField('falla')}
                       />
                      Operativa externa
                    </label>
                    <label className="pill">
                      <input
                        type="radio"
                        name="falla"
                        value="Técnica"
                        checked=${form.falla === 'Técnica'}
                        onChange=${updateField('falla')}
                       />
                      Técnica
                    </label>
                    <label className="pill">
                      <input
                        type="radio"
                        name="falla"
                        value="No presenta falla"
                        checked=${form.falla === 'No presenta falla'}
                        onChange=${updateField('falla')}
                       />
                      No presenta falla
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-header">
                <span>2. Datos del equipo</span>
                <div>
                  <button className="secondary" type="button" id="removeEquipo" onClick=${removeEquipoRow}>Eliminar fila</button>
                  <button className="secondary" type="button" id="addEquipo" onClick=${addEquipoRow}>Agregar fila</button>
                </div>
              </div>
              <div className="section-body">
                <div className="table-wrap">
                  <table id="equipoTable">
                    <thead>
                      <tr>
                        <th style=${{ width: '40px' }}>Ítem</th>
                        <th>Descripción / Nombre</th>
                        <th style=${{ width: '120px' }}>Marca</th>
                        <th style=${{ width: '140px' }}>Modelo / Ref.</th>
                        <th style=${{ width: '140px' }}>Serie / Lote</th>
                        <th style=${{ width: '140px' }}>Ubicación / Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${equipoRows.map((row, index) => html`
                        <tr key=${index}>
                          <td data-label="Equipo" style=${{ textAlign: 'center' }}>${index + 1}</td>
                          <td data-label="Descripción / Nombre">
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Descripción o nombre equipo ${index + 1}`}
                              value=${row.descripcion}
                              onInput=${updateEquipoRow(index, 'descripcion')}
                            />
                          </td>
                          <td data-label="Marca">
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Marca equipo ${index + 1}`}
                              value=${row.marca}
                              onInput=${updateEquipoRow(index, 'marca')}
                            />
                          </td>
                          <td data-label="Modelo / Ref.">
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Modelo o referencia equipo ${index + 1}`}
                              value=${row.modelo}
                              onInput=${updateEquipoRow(index, 'modelo')}
                            />
                          </td>
                          <td data-label="Serie / Lote">
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Serie o lote equipo ${index + 1}`}
                              value=${row.serie}
                              onInput=${updateEquipoRow(index, 'serie')}
                            />
                          </td>
                          <td data-label="Ubicación / Cantidad">
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Ubicación o cantidad equipo ${index + 1}`}
                              value=${row.ubicacion}
                              onInput=${updateEquipoRow(index, 'ubicacion')}
                            />
                          </td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-header">3. Actividad realizada</div>
              <div className="section-body">
                <${AutosizeTextarea}
                  className="autosize activity-textarea"
                  value=${form.actividadRealizada}
                  placeholder="Describe brevemente la actividad ejecutada..."
                  onInput=${updateField('actividadRealizada')}
                />
              </div>
            </div>

            <div className=${`section repuestos-section${repuestosEnabled ? '' : ' print-excluded'}`}>
              <div className="section-header">
                <span>${repuestosEnabled ? '4. Repuestos utilizados' : 'Repuestos utilizados — desactivado'}</span>
                <div className="repuestos-actions">
                  <button className="secondary" type="button" aria-controls="repuestos-body" aria-expanded=${repuestosEnabled}
                    onClick=${() => setRepuestosEnabled(prev => !prev)}>${repuestosEnabled ? 'Desactivar sección' : 'Activar sección'}</button>
                  <button className="secondary" type="button" id="removeRepuesto" disabled=${!repuestosEnabled} onClick=${removeRepuestoRow}>Eliminar fila</button>
                  <button className="secondary" type="button" id="addRepuesto" disabled=${!repuestosEnabled} onClick=${addRepuestoRow}>Agregar fila</button>
                </div>
              </div>
              ${!repuestosEnabled && html`<p className="repuestos-notice">Esta sección no se imprimirá. Puedes activarla de nuevo sin perder los datos.</p>`}
              <div className="section-body" id="repuestos-body" hidden=${!repuestosEnabled}>
                <div className="table-wrap">
                  <table id="repuestoTable">
                    <thead>
                      <tr>
                        <th style=${{ width: '120px' }}>Serie de equipo</th>
                        <th style=${{ width: '120px' }}>N° parte</th>
                        <th>Descripción</th>
                        <th style=${{ width: '110px' }}>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${repuestoRows.map((row, index) => html`
                        <tr key=${index}>
                          <td data-label="Serie de equipo">
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel="Serie de equipo repuesto"
                              value=${row.serie}
                              onInput=${updateRepuestoRow(index, 'serie')}
                            />
                          </td>
                          <td data-label="N° parte">
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel="Número de parte"
                              value=${row.parte}
                              onInput=${updateRepuestoRow(index, 'parte')}
                            />
                          </td>
                          <td data-label="Descripción">
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel="Descripción repuesto"
                              value=${row.descripcion}
                              onInput=${updateRepuestoRow(index, 'descripcion')}
                            />
                          </td>
                          <td data-label="Cantidad">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              aria-label="Cantidad repuesto"
                              value=${row.cantidad}
                              onInput=${updateRepuestoRow(index, 'cantidad')}
                             />
                          </td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-header">${repuestosEnabled ? '5. Resultado' : '4. Resultado'}</div>
              <div className="section-body grid cols-2">
                <div className="field" style=${{ gap: '10px' }}>
                  <label>Control de tiempos</label>
                  <div className="grid cols-2 time-grid" style=${{ gap: '8px' }}>
                    <div>
                      <small style=${{ color: 'var(--muted)' }}>Hora inicio</small>
                      <input type="time" value=${form.horaInicio} onInput=${updateField('horaInicio')} />
                    </div>
                    <div>
                      <small style=${{ color: 'var(--muted)' }}>Hora final</small>
                      <input type="time" value=${form.horaFinal} onInput=${updateField('horaFinal')} />
                    </div>
                    <div>
                      <small style=${{ color: 'var(--muted)' }}>Tiempo de trabajo (min)</small>
                      <input type="number" aria-label="Tiempo de trabajo (min)" readOnly value=${calculateWorkMinutes(form.horaInicio, form.horaFinal)} />
                    </div>
                  </div>
                  <div>
                    <small style=${{ color: 'var(--muted)' }}>First time fix</small>
                    <div className="pill-box">
                      <label className="pill">
                        <input
                          type="radio"
                          name="firstTimeFix"
                          value="Sí"
                          checked=${form.firstTimeFix === 'Sí'}
                          onChange=${updateField('firstTimeFix')}
                         />
                        Sí
                      </label>
                      <label className="pill">
                        <input
                          type="radio"
                          name="firstTimeFix"
                          value="No"
                          checked=${form.firstTimeFix === 'No'}
                          onChange=${updateField('firstTimeFix')}
                         />
                        No
                      </label>
                      <label className="pill">
                        <input
                          type="radio"
                          name="firstTimeFix"
                          value="N/A"
                          checked=${form.firstTimeFix === 'N/A'}
                          onChange=${updateField('firstTimeFix')}
                         />
                        N/A
                      </label>
                    </div>
                  </div>
                  <div>
                    <small style=${{ color: 'var(--muted)' }}>Estado final del equipo</small>
                    <div className="pill-box">
                      <label className="pill">
                        <input
                          type="radio"
                          name="estadoFinal"
                          value="Habilitado"
                          checked=${form.estadoFinal === 'Habilitado'}
                          onChange=${updateField('estadoFinal')}
                         />
                        Habilitado
                      </label>
                      <label className="pill">
                        <input
                          type="radio"
                          name="estadoFinal"
                          value="No habilitado"
                          checked=${form.estadoFinal === 'No habilitado'}
                          onChange=${updateField('estadoFinal')}
                         />
                        No habilitado
                      </label>
                    </div>
                  </div>
                  <div>
                    <small style=${{ color: 'var(--muted)' }}>Técnico responsable</small>
                    <input type="text" value=${form.tecnico} onInput=${updateField('tecnico')} />
                  </div>
                </div>
                <div className="field">
                  <label>Observaciones / Recomendaciones</label>
                  <${AutosizeTextarea}
                    className="autosize"
                    rows="8"
                    value=${form.observaciones}
                    onInput=${updateField('observaciones')}
                  />
                </div>
              </div>
            </div>

            <div className="signature">
              ${[['tecnico', 'Servicio técnico'], ['cliente', 'Cliente']].map(([key, label]) => html`
                <div key=${key} className="signature-slot">
                  <div className="signature-controls">
                    <button type="button" className="secondary" onClick=${() => setSignatureTarget(key)}>
                      ${signatures[key] ? 'Editar firma' : 'Firmar / cargar imagen'} — ${label}
                    </button>
                    ${signatures[key] && html`<button type="button" className="secondary"
                      onClick=${() => { setSignatures(prev => ({ ...prev, [key]: '' })); setSignatureMeta(prev => ({ ...prev, [key]: null })); }}>Quitar firma</button>`}
                  </div>
                  <div className="signature-space">
                    ${signatures[key] && html`<img src=${signatures[key]} alt=${`Firma de ${label}`} />`}
                  </div>
                  ${signatures[key] && signatureMeta[key] && html`<div className="signer-identity signature-caption">
                    <strong>${signatureMeta[key].signerTitle} ${signatureMeta[key].signerName}</strong>
                    <span>C.I. ${signatureMeta[key].signerIdentification}</span>
                    ${signatureMeta[key].demo && html`<small>DEMO · C.I. pendiente</small>`}
                  </div>`}
                  <div className="line">${label}</div>
                </div>
              `)}
            </div>
          </fieldset>
        </div>
        ${currentUser && historyOpen && html`<${ReportHistory} busy=${busy} onClose=${() => setHistoryOpen(false)} onOpen=${openReport} onDuplicate=${duplicateReport} />`}
        ${currentUser && choosingBrand && html`<${BrandPicker} selected=${brandId}
          onClose=${() => setChoosingBrand(false)}
          onSelect=${id => { setBrandId(id); setChoosingBrand(false); }} />`}
        ${currentUser && signatureTarget && html`<${SignatureAuthorization}
          label=${signatureTarget === 'tecnico' ? 'servicio técnico' : 'cliente'}
          role=${signatureTarget} payload=${snapshot()}
          onClose=${() => setSignatureTarget(null)}
          onSave=${(image, metadata) => {
            signedContent.current = contentKey;
            setSignatureMeta(prev => ({ ...prev, [signatureTarget]: metadata }));
            setSignatures(prev => ({ ...prev, [signatureTarget]: image }));
            setSignatureTarget(null);
          }} />`}
      </div>
    `;
  }

  const root = document.getElementById('root');
  ReactDOM.createRoot(root).render(html`<${App} />`);
})();



