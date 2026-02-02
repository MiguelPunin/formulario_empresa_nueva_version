(function () {
  function createAutoSize() {
    function autosize(el, noCap) {
      const isPdf = document.body.classList.contains('pdf-mode');
      const base = 16;
      const max = 5000;
      el.style.maxHeight = noCap ? 'none' : '';
      el.style.overflow = noCap ? 'visible' : 'auto';
      el.style.height = 'auto';
      const desired = Math.max(el.scrollHeight, base);
      el.style.height = Math.min(desired, max) + 'px';
    }

    function autosizeAll(noCap) {
      document.querySelectorAll('.autosize').forEach(el => autosize(el, noCap));
    }

    return {
      autosize,
      autosizeAll,
    };
  }

  window.createAutoSize = createAutoSize;
})();
