(function (global) {
  const App  = global.App = global.App || {};
  const refs = App.ui.refs;

  const Base = App.modules.TelefoniaDashboardBase;

  function render(data, filters) {
    if (!refs.dashboardContentEl) return;

    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhum dado encontrado para os filtros selecionados.</div>';
      return;
    }

    const t = data.totals;

    // Texto dos filtros (opcional, mas ajuda o admin)
    const tipoTxt =
      (filters.callType === 'inbound')  ? 'Recebidas' :
      (filters.callType === 'outbound') ? 'Realizadas' :
      'Nenhum (todas)';

    const usersTxt =
      (filters.usersMode === 'select' && filters.collaboratorIds?.length)
        ? `Selecionados (${filters.collaboratorIds.length})`
        : 'Todos';

    const metricaTxt =
      (filters.metric === 'unique_numbers') ? 'Números únicos' :
      'Ligações';

    let html = '';
    html += '<h3>Análise Comercial</h3>';
    html += `<p>
      Tipo de ligação: <strong>${tipoTxt}</strong><br>
      Usuários: <strong>${usersTxt}</strong><br>
      Métrica: <strong>${metricaTxt}</strong>
    </p>`;

    // Totais
    html += `<p>
      Total de ligações: ${t.totalCalls || 0}<br>
      Total de números únicos: ${t.uniqueNumbers || 0}<br>
      Atendidas: ${t.answered || 0}<br>
      Perdidas: ${t.missed || 0}<br>
      Tempo total (hh:mm:ss): <strong>${Base.formatHMS(t.totalDurationSeconds || 0)}</strong>
    </p>`;

    // Por usuário
    html += '<h4>Resumo por usuário</h4>';
    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th class="num">Ligações</th>
            <th class="num">Números únicos</th>
            <th class="num">Atendidas</th>
            <th class="num">Perdidas</th>
            <th class="num">Tempo (hh:mm:ss)</th>
          </tr>
        </thead>
        <tbody>
    `;

    (data.byUser || []).forEach(row => {
      const label = row.userName || row.userId || '-';
      html += `
        <tr>
          <td>${label}</td>
          <td class="num">${row.totalCalls || 0}</td>
          <td class="num">${row.uniqueNumbers || 0}</td>
          <td class="num">${row.answered || 0}</td>
          <td class="num">${row.missed || 0}</td>
          <td class="num">${Base.formatHMS(row.totalDurationSeconds || 0)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';

    // Top números (ajuda MUITO comercialmente e casa com o filtro “números únicos”)
    html += '<h4>Top números (por volume de ligações)</h4>';
    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Número</th>
            <th class="num">Ligações</th>
            <th class="num">Tempo (hh:mm:ss)</th>
          </tr>
        </thead>
        <tbody>
    `;

    (data.topNumbers || []).forEach(r => {
      html += `
        <tr>
          <td>${r.number}</td>
          <td class="num">${r.count || 0}</td>
          <td class="num">${Base.formatHMS(r.totalDurationSeconds || 0)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';

    refs.dashboardContentEl.innerHTML = html;
  }

  App.modules.TelefoniaDashboardCommercial = { render };
})(window);