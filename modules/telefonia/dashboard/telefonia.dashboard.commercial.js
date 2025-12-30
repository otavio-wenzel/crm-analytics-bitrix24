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

    let html = '';
    html += '<h3>Análise Comercial</h3>';

    html += `<p>
      Total de ligações: <strong>${data.totals.totalCalls || 0}</strong><br>
      Recebidas: <strong>${data.totals.inbound || 0}</strong><br>
      Realizadas: <strong>${data.totals.outbound || 0}</strong><br>
      Contatos (números únicos): <strong>${data.totals.uniqueNumbers || 0}</strong><br>
      Tempo total (hh:mm:ss): <strong>${Base.formatHMS(data.totals.totalDurationSeconds || 0)}</strong>
    </p>`;

    html += `
      <h4>Por usuário</h4>
      <table class="simple-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th class="num">Ligações</th>
            <th class="num">Recebidas</th>
            <th class="num">Realizadas</th>
            <th class="num">Contatos</th>
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
          <td class="num">${row.totalCalls || 0}</td>
          <td class="num">${row.inbound || 0}</td>
          <td class="num">${row.outbound || 0}</td>
          <td class="num">${row.uniqueNumbers || 0}</td>
          <td class="num">${Base.formatHMS(row.totalDurationSeconds || 0)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    refs.dashboardContentEl.innerHTML = html;
  }

  App.modules.TelefoniaDashboardCommercial = { render };
})(window);