//telefonia.dashboard.overview.js
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

    const totalHms = Base.formatHMS(data.totals.totalDurationSeconds || 0);

    let html = '';
    html += '<h3>Visão geral de chamadas</h3>';
    html += `<p>
      Total de chamadas: <strong>${data.totals.totalCalls || 0}</strong><br>
      Chamadas recebidas (entrada): <strong>${data.totals.inbound || 0}</strong><br>
      Chamadas realizadas (saída): <strong>${data.totals.outbound || 0}</strong><br>
      Tempo total (hh:mm:ss): <strong>${totalHms}</strong>
      ${typeof data.totals.unknown === 'number' ? `<br>Desconhecidas: <strong>${data.totals.unknown}</strong>` : ''}
    </p>`;

    html += '<h4>Chamadas por usuário</h4>';

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
            <th class="num">Recebidas</th>
            <th class="num">Realizadas</th>
            <th class="num">Tempo (hh:mm:ss)</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(row => {
      const label = row.userName || row.userId;

      // compatibilidade: alguns aggregators retornam totalCalls, outros "total"
      const total = (row.totalCalls ?? row.total ?? 0);

      html += `
        <tr>
          <td>${label}</td>
          <td class="num">${total}</td>
          <td class="num">${row.inbound || 0}</td>
          <td class="num">${row.outbound || 0}</td>
          <td class="num">${Base.formatHMS(row.totalDurationSeconds || 0)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    refs.dashboardContentEl.innerHTML = html;
  }

  App.modules.TelefoniaDashboardOverview = { render };
})(window);