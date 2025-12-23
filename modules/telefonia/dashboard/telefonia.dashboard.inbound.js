(function (global) {
  const App = global.App = global.App || {};
  const refs = App.ui.refs;

  const Base = App.modules.TelefoniaDashboardBase;

  function render(data) {
    if (!refs.dashboardContentEl) return;
    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhuma chamada recebida no período.</div>';
      return;
    }

    let html = '';
    html += '<h3>Chamadas recebidas</h3>';
    html += `<p>
      Total de chamadas recebidas: ${data.totals.totalCalls}<br>
      Atendidas: ${data.totals.answered}<br>
      Perdidas: ${data.totals.missed}<br>
      Tempo total (hh:mm:ss): <strong>${Base.formatHMS(data.totals.totalDurationSeconds)}</strong>
    </p>`;

    html += '<h4>Por usuário</h4>';
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

    (data.byUser || []).forEach(row => {
      const label = row.userName || row.userId;
      html += `
        <tr>
          <td>${label}</td>
          <td class="num">${row.total || 0}</td>
          <td class="num">${row.answered || 0}</td>
          <td class="num">${row.missed || 0}</td>
          <td class="num">${Base.formatHMS(row.totalDurationSeconds || 0)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    refs.dashboardContentEl.innerHTML = html;
  }

  App.modules.TelefoniaDashboardInbound = { render };
})(window);