(function () {
  function createTablesComponent(options) {
    const { equipoTable, repuestoTable, autosizeAll } = options;

    function addEquipoRow() {
      const row = document.createElement('tr');
      const idx = equipoTable.children.length + 1;
      row.innerHTML =
        '<td style="text-align:center;">' + idx + '</td>' +
        '<td><textarea class="table-input autosize" aria-label="Descripción o nombre equipo ' + idx + '"></textarea></td>' +
        '<td><textarea class="table-input autosize" aria-label="Marca equipo ' + idx + '"></textarea></td>' +
        '<td><textarea class="table-input autosize" aria-label="Modelo o referencia equipo ' + idx + '"></textarea></td>' +
        '<td><textarea class="table-input autosize" aria-label="Serie o lote equipo ' + idx + '"></textarea></td>' +
        '<td><textarea class="table-input autosize" aria-label="Ubicación o cantidad equipo ' + idx + '"></textarea></td>';
      equipoTable.appendChild(row);
      autosizeAll();
    }

    function addRepuestoRow() {
      const row = document.createElement('tr');
      row.innerHTML =
        '<td><textarea class="table-input autosize" aria-label="Serie de equipo repuesto"></textarea></td>' +
        '<td><textarea class="table-input autosize" aria-label="Número de parte"></textarea></td>' +
        '<td><textarea class="table-input autosize" aria-label="Descripción repuesto"></textarea></td>' +
        '<td><input type="number" min="0" step="1" aria-label="Cantidad repuesto"></td>';
      repuestoTable.appendChild(row);
      autosizeAll();
    }

    function removeLastRow(tableBody, minRows) {
      if (tableBody.children.length > minRows) {
        tableBody.removeChild(tableBody.lastElementChild);
      }
    }

    function removeEquipoRow() {
      removeLastRow(equipoTable, 1);
    }

    function removeRepuestoRow() {
      removeLastRow(repuestoTable, 1);
    }

    function clearTables() {
      while (equipoTable.firstChild) equipoTable.removeChild(equipoTable.firstChild);
      while (repuestoTable.firstChild) repuestoTable.removeChild(repuestoTable.firstChild);
    }

    function seedRows(equipoCount, repuestoCount) {
      const equipoTotal = typeof equipoCount === 'number' ? equipoCount : 3;
      const repuestoTotal = typeof repuestoCount === 'number' ? repuestoCount : 2;
      for (let i = 0; i < equipoTotal; i++) addEquipoRow();
      for (let i = 0; i < repuestoTotal; i++) addRepuestoRow();
    }

    function bind(buttons) {
      const {
        addEquipoBtn,
        addRepuestoBtn,
        removeEquipoBtn,
        removeRepuestoBtn,
      } = buttons || {};

      if (addEquipoBtn) addEquipoBtn.addEventListener('click', addEquipoRow);
      if (addRepuestoBtn) addRepuestoBtn.addEventListener('click', addRepuestoRow);
      if (removeEquipoBtn) removeEquipoBtn.addEventListener('click', removeEquipoRow);
      if (removeRepuestoBtn) removeRepuestoBtn.addEventListener('click', removeRepuestoRow);
    }

    return {
      addEquipoRow,
      addRepuestoRow,
      removeEquipoRow,
      removeRepuestoRow,
      clearTables,
      seedRows,
      bind,
    };
  }

  window.createTablesComponent = createTablesComponent;
})();
