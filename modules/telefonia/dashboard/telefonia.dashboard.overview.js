(function (global) {
  const App = global.App = global.App || {};
  const refs = App.ui.refs;

  const Base = App.modules.TelefoniaDashboardBase;

  function render(data) {
    if (!refs.dashboardContentEl) return;
    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhum dado encontrado para o período selecionado.</div>';
      return;
    }

    const totalHms = Base.formatHMS(data.totals.totalDurationSeconds);

    let html = '';
    html += '<h3>Visão geral de chamadas</h3>';
    html += `<p>
      Total de chamadas: ${data.totals.totalCalls}<br>
      Chamadas recebidas (entrada): ${data.totals.inbound}<br>
      Chamadas realizadas (saída): ${data.totals.outbound}<br>
      Tempo total (hh:mm:ss): <strong>${totalHms}</strong>
      ${typeof data.totals.unknown === 'number' ? `<br>Desconhecidas: ${data.totals.unknown}` : ''}
    </p>`;

    html += '<h4>Chamadas por usuário</h4>';
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

    (data.byUser || []).forEach(row => {
      const label = row.userName || row.userId;
      html += `
        <tr>
          <td>${label}</td>
          <td class="num">${row.total || 0}</td>
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