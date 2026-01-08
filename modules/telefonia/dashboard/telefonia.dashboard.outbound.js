//telefonia.dashboard.outbound.js
(function (global) {
  const App = global.App = global.App || {};
  const refs = App.ui.refs;

  const Base = App.modules.TelefoniaDashboardBase;

  function render(data) {
    if (!refs.dashboardContentEl) return;

    if (!data || !data.totals) {
      Base.renderEmpty('Nenhum resultado encontrado para os filtros selecionados.');
      return;
    }

    let html = '';
    html += '<h3>Chamadas realizadas (saída)</h3>';
    html += `<p>
      Total de chamadas realizadas: <strong>${data.totals.totalCalls || 0}</strong><br>
      Atendidas: <strong>${data.totals.answered || 0}</strong><br>
      Não atendidas / perdidas: <strong>${data.totals.missed || 0}</strong><br>
      Tempo total (hh:mm:ss): <strong>${Base.formatHMS(data.totals.totalDurationSeconds || 0)}</strong>
    </p>`;

    html += '<h4>Por usuário</h4>';

    const rows = Array.isArray(data.byUser) ? data.byUser : [];
    if (!rows.length) {
      html += Base.emptyHtml('Nenhum resultado encontrado para os filtros selecionados.');
      refs.dashboardContentEl.innerHTML = html;
      return;
    }

    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th class="num">Total</th>
            <th class="num">Atendidas</th>
            <th class="num">Perdidas</th>
            <th class="num">Tempo (hh:mm:ss)</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(row => {
      const label = row.userName || row.userId;
      const total = (row.totalCalls ?? row.total ?? 0);

      html += `
        <tr>
          <td>${label}</td>
          <td class="num">${total}</td>
          <td class="num">${row.answered || 0}</td>
          <td class="num">${row.missed || 0}</td>
          <td class="num">${Base.formatHMS(row.totalDurationSeconds || 0)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    refs.dashboardContentEl.innerHTML = html;
  }

  App.modules.TelefoniaDashboardOutbound = { render };
})(window);