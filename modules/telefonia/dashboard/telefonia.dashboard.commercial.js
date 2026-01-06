(function (global) {
  const App = global.App = global.App || {};
  const refs = App.ui.refs;

  const Base = App.modules.TelefoniaDashboardBase;

  function renderStatusTable(statusSummary) {
    const rows = Array.isArray(statusSummary) ? statusSummary : [];

    let html = '';
    html += `<div style="margin-top:16px;">`;
    html += `<h4>Status</h4>`;

    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Status</th>
            <th class="num">Quantidade</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (!rows.length) {
      html += `<tr><td colspan="2" class="placeholder">Nenhum dado de status.</td></tr>`;
    } else {
      rows.forEach(r => {
        html += `
          <tr>
            <td>${Base.escapeHtml(r.status || r.key || '')}</td>
            <td class="num">${Number(r.count || 0)}</td>
          </tr>
        `;
      });
    }

    html += `</tbody></table></div>`;
    return html;
  }

  function render(data) {
    if (!refs.dashboardContentEl) return;

    if (!data || !data.totals) {
      Base.renderEmpty('Nenhum resultado encontrado para os filtros selecionados.');
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

    html += `<h4>Por usuário</h4>`;

    const rows = Array.isArray(data.byUser) ? data.byUser : [];
    if (!rows.length) {
      html += Base.emptyHtml('Nenhum resultado encontrado para os filtros selecionados.');
    } else {
      html += `
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

      rows.forEach(row => {
        const label = Base.escapeHtml(row.userName || row.userId);
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
    }

    // ✅ Segunda tabela: Status (permanece SEMPRE)
    html += renderStatusTable(data.statusSummary);

    refs.dashboardContentEl.innerHTML = html;
  }

  App.modules.TelefoniaDashboardCommercial = { render };
})(window);