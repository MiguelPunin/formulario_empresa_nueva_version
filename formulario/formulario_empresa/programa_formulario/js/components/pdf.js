(function () {
  function createPdfComponent(options) {
    const {
      pdfBtn,
      sheet,
      numeroReporteInput,
      clienteInput,
      fechaInput,
      getCurrentUser,
      autosizeAll,
    } = options;

    function buildFileName() {
      const num = numeroReporteInput.value.trim() || 'reporte';
      const date = fechaInput.value || new Date().toISOString().slice(0, 10);
      const cliente = (clienteInput.value || 'cliente').trim().replace(/\s+/g, '_');
      const user = getCurrentUser() ? getCurrentUser().user : 'usuario';
      return num + '_' + cliente + '_' + user + '_' + date + '.pdf';
    }

    function setPdfMode(on) {
      document.body.classList.toggle('pdf-mode', on);
    }

    async function downloadPDF() {
      if (typeof html2pdf === 'undefined') {
        alert('No se pudo cargar la librería html2pdf. Verifica que el archivo libs/html2pdf.bundle.min.js exista o tu conexión a internet.');
        return;
      }
      const element = sheet;
      const opt = {
        margin: 2,
        filename: buildFileName(),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] },
      };
      pdfBtn.disabled = true;
      pdfBtn.textContent = 'Generando...';
      setPdfMode(true);
      autosizeAll(true);
      try {
        await html2pdf().from(element).set(opt).save();
      } catch (err) {
        alert('No se pudo generar el PDF: ' + err.message);
        console.error(err);
      } finally {
        setPdfMode(false);
        autosizeAll(false);
        pdfBtn.disabled = false;
        pdfBtn.textContent = 'Descargar PDF';
      }
    }

    function bind() {
      if (pdfBtn) pdfBtn.addEventListener('click', downloadPDF);
    }

    return {
      buildFileName,
      setPdfMode,
      downloadPDF,
      bind,
    };
  }

  window.createPdfComponent = createPdfComponent;
})();
