(function () {
  function createFormComponent(options) {
    const { tables, fechaInput, autosizeAll } = options;
    const INPUT_SELECTOR = 'input[type="text"], input[type="email"], input[type="date"], input[type="time"], input[type="number"], textarea';
    const CHECK_SELECTOR = 'input[type="checkbox"], input[type="radio"]';

    function clearForm() {
      document.querySelectorAll(INPUT_SELECTOR).forEach(el => { el.value = ''; });
      document.querySelectorAll(CHECK_SELECTOR).forEach(el => { el.checked = false; });
      tables.clearTables();
      tables.seedRows(3, 2);
      fechaInput.valueAsDate = new Date();
      autosizeAll();
    }

    function bind(buttons) {
      const { clearBtn } = buttons || {};
      if (clearBtn) clearBtn.addEventListener('click', clearForm);
    }

    return {
      clearForm,
      bind,
    };
  }

  window.createFormComponent = createFormComponent;
})();
