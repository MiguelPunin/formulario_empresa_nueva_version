(function () {
  const { useState, useEffect, useRef, useLayoutEffect } = React;
  const html = htm.bind(React.createElement);

  const USERS = [
    { user: 'usuario1', pass: '1234', nombre: 'Usuario 1' },
    { user: 'usuario2', pass: '1234', nombre: 'Usuario 2' },
    { user: 'usuario3', pass: '1234', nombre: 'Usuario 3' },
  ];

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
    return new Date().toISOString().slice(0, 10);
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

    return html`
      <div className=${`login-overlay ${visible ? '' : 'hidden'}`} id="loginOverlay">
        <div className="login-card">
          <div className="login-logo" aria-hidden="true">RS</div>
          <div className="login-copy">
            <h2>Acceso</h2>
            <p>Sistema de reporte de servicio</p>
          </div>
          <div>
            <label htmlFor="loginUser">Usuario</label>
            <input
              id="loginUser"
              type="text"
              autoComplete="username"
              placeholder="usuario1"
              value=${loginUser}
              onInput=${onUserChange}
              onKeyUp=${(e) => { if (e.key === 'Enter') onLogin(); }}
            />
          </div>
          <div>
            <label htmlFor="loginPass">Contraseña</label>
            <input
              id="loginPass"
              type="password"
              autoComplete="current-password"
              placeholder="******"
              value=${loginPass}
              onInput=${onPassChange}
              onKeyUp=${(e) => { if (e.key === 'Enter') onLogin(); }}
            />
          </div>
          <div className="login-error" id="loginError">${loginError}</div>
          <div className="login-actions">
            <button className="secondary" id="loginClear" type="button" onClick=${onClear}>Limpiar</button>
            <button id="loginBtn" type="button" onClick=${onLogin}>Entrar</button>
          </div>
        </div>
      </div>
    `;
  }

  function SignaturePad({ label, initialValue, onSave, onClose }) {
    const dialogRef = useRef(null);
    const canvasRef = useRef(null);
    const pointer = useRef(null);
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

    function point(event) {
      const bounds = canvasRef.current.getBoundingClientRect();
      return [(event.clientX - bounds.left) * 900 / bounds.width,
        (event.clientY - bounds.top) * 300 / bounds.height];
    }

    function start(event) {
      if (pointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
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
        <p>Firma con el dedo, lápiz táctil o mouse dentro del recuadro.</p>
        <canvas ref=${canvasRef} width="900" height="300" aria-label=${`Área para firmar: ${label}`}
          onPointerDown=${start} onPointerMove=${move} onPointerUp=${stop}
          onPointerCancel=${stop} onLostPointerCapture=${stop} />
        <div className="signature-actions">
          <button type="button" className="secondary" onClick=${() => {
            canvasRef.current.getContext('2d').clearRect(0, 0, 900, 300);
            setHasInk(false);
          }}>Borrar trazo</button>
          <button type="button" className="secondary" onClick=${onClose}>Cancelar</button>
          <button type="button" disabled=${!hasInk} onClick=${() => onSave(canvasRef.current.toDataURL('image/png'))}>Guardar firma</button>
        </div>
      </dialog>
    `;
  }

  function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loginUser, setLoginUser] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [loginError, setLoginError] = useState('');
    const [reportNumber, setReportNumber] = useState('00191');
    const [form, setForm] = useState(createInitialForm);
    const [equipoRows, setEquipoRows] = useState(createInitialEquipoRows);
    const [repuestoRows, setRepuestoRows] = useState(createInitialRepuestoRows);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const sheetRef = useRef(null);
    const [signatures, setSignatures] = useState({ tecnico: '', cliente: '' });
    const [signatureTarget, setSignatureTarget] = useState(null);

    useEffect(() => {
      const saved = sessionStorage.getItem('loggedUser');
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.user && parsed.pass) {
          const match = USERS.find(u => u.user === parsed.user && u.pass === parsed.pass);
          if (match) {
            setCurrentUser(match);
          }
        }
      } catch (err) {
        sessionStorage.removeItem('loggedUser');
      }
    }, []);

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

    function clearForm() {
      setSignatures({ tecnico: '', cliente: '' });
      setSignatureTarget(null);
      setReportNumber('');
      setForm(createInitialForm());
      setEquipoRows(createInitialEquipoRows());
      setRepuestoRows(createInitialRepuestoRows());
    }

    function handleLogin() {
      const found = USERS.find(entry => entry.user === loginUser.trim() && entry.pass === loginPass);
      if (!found) {
        setLoginError('Usuario o contraseña incorrectos');
        return;
      }
      setCurrentUser(found);
      sessionStorage.setItem('loggedUser', JSON.stringify(found));
      setLoginError('');
      clearForm();
    }

    function handleLogout() {
      setSignatures({ tecnico: '', cliente: '' });
      setSignatureTarget(null);
      setCurrentUser(null);
      sessionStorage.removeItem('loggedUser');
    }

    function handleClearLogin() {
      setLoginUser('');
      setLoginPass('');
      setLoginError('');
    }

    function buildFileName() {
      const num = reportNumber.trim() || 'reporte';
      const date = form.fecha || getToday();
      const cliente = (form.cliente || 'cliente').trim().replace(/\s+/g, '_');
      const user = currentUser ? currentUser.user : 'usuario';
      return num + '_' + cliente + '_' + user + '_' + date + '.pdf';
    }

    function downloadPDF() {
      const element = sheetRef.current;
      if (!element) return;

      const prevTitle = document.title;
      const fileName = buildFileName().replace(/\.pdf$/i, '');
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

        <div className="sheet" id="sheet" ref=${sheetRef}>
          <div className="sheet-header">
            <div className="title">
              <h1>REPORTE DE SERVICIO</h1>
              <small>Departamento Biomédico</small>
            </div>
            <img className="brand-logo" src="assets/totalcare-pharma.png" alt="TotalCare Pharma" />
            <div className="report-number">
              <label htmlFor="numeroReporte">Número de reporte</label>
              <input
                id="numeroReporte"
                type="text"
                value=${reportNumber}
                onInput=${(e) => setReportNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="toolbar">
            ${currentUser ? html`
              <div className="user-chip" id="userChip">
                <span className="dot"></span>
                <span id="userNameLabel">${userLabel}</span>
              </div>
            ` : null}
            <div className="spacer"></div>
            <div className="buttons">
              <button className="secondary" id="logoutBtn" type="button" onClick=${handleLogout}>Salir</button>
              <button id="pdfBtn" type="button" disabled=${pdfGenerating} onClick=${downloadPDF}>
                ${pdfGenerating ? 'Generando...' : 'Descargar PDF'}
              </button>
              <button className="secondary" id="clearBtn" type="button" onClick=${clearForm}>Limpiar</button>
            </div>
          </div>

          <div className="content" id="report">
            <div className="grid cols-3 compact-grid">
              <div className="field compact">
                <label>Unidad técnica de soporte</label>
                <input type="text" value=${form.unidadSoporte} onInput=${updateField('unidadSoporte')} />
              </div>
              <div className="field compact">
                <label>Cliente</label>
                <input type="text" id="cliente" value=${form.cliente} onInput=${updateField('cliente')} />
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
                          <td style=${{ textAlign: 'center' }}>${index + 1}</td>
                          <td>
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Descripción o nombre equipo ${index + 1}`}
                              value=${row.descripcion}
                              onInput=${updateEquipoRow(index, 'descripcion')}
                            />
                          </td>
                          <td>
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Marca equipo ${index + 1}`}
                              value=${row.marca}
                              onInput=${updateEquipoRow(index, 'marca')}
                            />
                          </td>
                          <td>
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Modelo o referencia equipo ${index + 1}`}
                              value=${row.modelo}
                              onInput=${updateEquipoRow(index, 'modelo')}
                            />
                          </td>
                          <td>
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel=${`Serie o lote equipo ${index + 1}`}
                              value=${row.serie}
                              onInput=${updateEquipoRow(index, 'serie')}
                            />
                          </td>
                          <td>
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
                  className="autosize"
                  value=${form.actividadRealizada}
                  placeholder="Describe brevemente la actividad ejecutada..."
                  onInput=${updateField('actividadRealizada')}
                />
              </div>
            </div>

            <div className="section">
              <div className="section-header">
                <span>4. Repuestos utilizados</span>
                <div>
                  <button className="secondary" type="button" id="removeRepuesto" onClick=${removeRepuestoRow}>Eliminar fila</button>
                  <button className="secondary" type="button" id="addRepuesto" onClick=${addRepuestoRow}>Agregar fila</button>
                </div>
              </div>
              <div className="section-body">
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
                          <td>
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel="Serie de equipo repuesto"
                              value=${row.serie}
                              onInput=${updateRepuestoRow(index, 'serie')}
                            />
                          </td>
                          <td>
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel="Número de parte"
                              value=${row.parte}
                              onInput=${updateRepuestoRow(index, 'parte')}
                            />
                          </td>
                          <td>
                            <${AutosizeTextarea}
                              className="table-input autosize"
                              ariaLabel="Descripción repuesto"
                              value=${row.descripcion}
                              onInput=${updateRepuestoRow(index, 'descripcion')}
                            />
                          </td>
                          <td>
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
              <div className="section-header">5. Resultado</div>
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
                      ${signatures[key] ? 'Editar firma' : 'Firmar'} — ${label}
                    </button>
                    ${signatures[key] && html`<button type="button" className="secondary"
                      onClick=${() => setSignatures(prev => ({ ...prev, [key]: '' }))}>Quitar firma</button>`}
                  </div>
                  <div className="signature-space">
                    ${signatures[key] && html`<img src=${signatures[key]} alt=${`Firma de ${label}`} />`}
                  </div>
                  <div className="line">${label}</div>
                </div>
              `)}
            </div>
          </div>
        </div>
        ${signatureTarget && html`<${SignaturePad}
          label=${signatureTarget === 'tecnico' ? 'servicio técnico' : 'cliente'}
          initialValue=${signatures[signatureTarget]}
          onClose=${() => setSignatureTarget(null)}
          onSave=${image => {
            setSignatures(prev => ({ ...prev, [signatureTarget]: image }));
            setSignatureTarget(null);
          }} />`}
      </div>
    `;
  }

  const root = document.getElementById('root');
  ReactDOM.createRoot(root).render(html`<${App} />`);
})();



