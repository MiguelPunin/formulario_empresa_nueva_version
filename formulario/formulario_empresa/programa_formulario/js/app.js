(function () {
  const state = window.createAppState();
  const autosize = window.createAutoSize();

  const refs = {
    equipoTable: document.querySelector('#equipoTable tbody'),
    repuestoTable: document.querySelector('#repuestoTable tbody'),
    addEquipoBtn: document.getElementById('addEquipo'),
    addRepuestoBtn: document.getElementById('addRepuesto'),
    removeEquipoBtn: document.getElementById('removeEquipo'),
    removeRepuestoBtn: document.getElementById('removeRepuesto'),
    clearBtn: document.getElementById('clearBtn'),
    pdfBtn: document.getElementById('pdfBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    fechaInput: document.getElementById('fecha'),
    numeroReporteInput: document.getElementById('numeroReporte'),
    clienteInput: document.getElementById('cliente'),
    sheet: document.getElementById('sheet'),
    loginOverlay: document.getElementById('loginOverlay'),
    loginBtn: document.getElementById('loginBtn'),
    loginClear: document.getElementById('loginClear'),
    loginError: document.getElementById('loginError'),
    loginUser: document.getElementById('loginUser'),
    loginPass: document.getElementById('loginPass'),
    userChip: document.getElementById('userChip'),
    userNameLabel: document.getElementById('userNameLabel'),
  };

  const tables = window.createTablesComponent({
    equipoTable: refs.equipoTable,
    repuestoTable: refs.repuestoTable,
    autosizeAll: autosize.autosizeAll,
  });

  const form = window.createFormComponent({
    tables,
    fechaInput: refs.fechaInput,
    autosizeAll: autosize.autosizeAll,
  });

  const pdf = window.createPdfComponent({
    pdfBtn: refs.pdfBtn,
    sheet: refs.sheet,
    numeroReporteInput: refs.numeroReporteInput,
    clienteInput: refs.clienteInput,
    fechaInput: refs.fechaInput,
    getCurrentUser: state.getUser,
    autosizeAll: autosize.autosizeAll,
  });

  const auth = window.createAuthComponent({
    loginOverlay: refs.loginOverlay,
    loginBtn: refs.loginBtn,
    loginClear: refs.loginClear,
    loginUser: refs.loginUser,
    loginPass: refs.loginPass,
    loginError: refs.loginError,
    userChip: refs.userChip,
    userNameLabel: refs.userNameLabel,
    logoutBtn: refs.logoutBtn,
    state,
    onLogin: form.clearForm,
  });

  tables.bind({
    addEquipoBtn: refs.addEquipoBtn,
    addRepuestoBtn: refs.addRepuestoBtn,
    removeEquipoBtn: refs.removeEquipoBtn,
    removeRepuestoBtn: refs.removeRepuestoBtn,
  });
  form.bind({ clearBtn: refs.clearBtn });
  pdf.bind();
  auth.bind();

  window.addEventListener('input', (e) => {
    if (e.target.classList && e.target.classList.contains('autosize')) {
      autosize.autosize(e.target);
    }
  });

  form.clearForm();
  auth.restoreSession();

  if (!state.getUser() && refs.loginUser) {
    refs.loginUser.focus();
  }
})();
