(function (global) {
  const App  = global.App = global.App || {};
  const refs = App.ui.refs;

  function formatHMS(totalSeconds) {
    const s = Math.max(0, parseInt(totalSeconds, 10) || 0);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }

  function showLoading(isLoading) {
    if (!refs.dashboardContentEl) return;
    if (isLoading) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Carregando dados de telefonia...</div>';
    }
  }

  function renderError(message) {
    if (!refs.dashboardContentEl) return;
    refs.dashboardContentEl.innerHTML =
      `<div class="placeholder">${message || 'Erro ao carregar dados.'}</div>`;
  }

  function renderOverview(data, filters) {
    if (!refs.dashboardContentEl) return;
    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhum dado encontrado para o período selecionado.</div>';
      return;
    }

    const totalHms = formatHMS(data.totals.totalDurationSeconds);

    let html = '';
    html += '<h3>Visão geral de chamadas</h3>';
    html += `<p>
      Total de chamadas: ${data.totals.totalCalls}<br>
      Chamadas recebidas (entrada): ${data.totals.inbound}<br>
      Chamadas realizadas (saída): ${data.totals.outbound}<br>
      Tempo total (hh:mm:ss): <strong>${totalHms}</strong>
      ${typeof data.totals.unknown === 'number' ? `<br>Desconhecidas: ${data.totals.unknown}` : ''}
    </p>`;

    html += '<h4>Chamadas por usuário (todas as direções)</h4>';
    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Total</th>
            <th>Atendidas</th>
            <th>Perdidas</th>
            <th>Tempo (hh:mm:ss)</th>
          </tr>
        </thead>
        <tbody>
    `;
    (data.byUser || []).forEach(row => {
      const label = row.userName || row.userId;
      const hms = formatHMS(row.totalDurationSeconds);
      html += `
        <tr>
          <td>${label}</td>
          <td>${row.total}</td>
          <td>${row.answered}</td>
          <td>${row.missed}</td>
          <td>${hms}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';

    refs.dashboardContentEl.innerHTML = html;
  }

  function renderChamadasRecebidas(data, filters) {
    if (!refs.dashboardContentEl) return;
    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhuma chamada recebida no período.</div>';
      return;
    }

    const totalHms = formatHMS(data.totals.totalDurationSeconds);

    let html = '';
    html += '<h3>Chamadas recebidas</h3>';
    html += `<p>
      Total de chamadas recebidas: ${data.totals.totalCalls}<br>
      Atendidas: ${data.totals.answered}<br>
      Perdidas: ${data.totals.missed}<br>
      Tempo total (hh:mm:ss): <strong>${totalHms}</strong>
    </p>`;

    html += '<h4>Por usuário</h4>';
    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Total</th>
            <th>Atendidas</th>
            <th>Perdidas</th>
            <th>Tempo (hh:mm:ss)</th>
          </tr>
        </thead>
        <tbody>
    `;
    (data.byUser || []).forEach(row => {
      const label = row.userName || row.userId;
      const hms = formatHMS(row.totalDurationSeconds);
      html += `
        <tr>
          <td>${label}</td>
          <td>${row.total}</td>
          <td>${row.answered}</td>
          <td>${row.missed}</td>
          <td>${hms}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';

    refs.dashboardContentEl.innerHTML = html;
  }

  function renderChamadasRealizadas(data, filters) {
    if (!refs.dashboardContentEl) return;
    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhuma chamada realizada no período.</div>';
      return;
    }

    const totalHms = formatHMS(data.totals.totalDurationSeconds);

    let html = '';
    html += '<h3>Chamadas realizadas (saída)</h3>';
    html += `<p>
      Total de chamadas realizadas: ${data.totals.totalCalls}<br>
      Atendidas: ${data.totals.answered}<br>
      Não atendidas / perdidas: ${data.totals.missed}<br>
      Tempo total (hh:mm:ss): <strong>${totalHms}</strong>
    </p>`;

    html += '<h4>Por usuário</h4>';
    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Total</th>
            <th>Atendidas</th>
            <th>Perdidas</th>
            <th>Tempo (hh:mm:ss)</th>
          </tr>
        </thead>
        <tbody>
    `;
    (data.byUser || []).forEach(row => {
      const label = row.userName || row.userId;
      const hms = formatHMS(row.totalDurationSeconds);
      html += `
        <tr>
          <td>${label}</td>
          <td>${row.total}</td>
          <td>${row.answered}</td>
          <td>${row.missed}</td>
          <td>${hms}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';

    // status (código técnico) com contagem + duração total por código
    html += '<h4>Status (CALL_FAILED_CODE)</h4>';
    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Qtd</th>
            <th>Tempo (hh:mm:ss)</th>
          </tr>
        </thead>
        <tbody>
    `;
    (data.byStatus || []).forEach(row => {
      const hms = formatHMS(row.totalDurationSeconds);
      html += `
        <tr>
          <td>${row.status}</td>
          <td>${row.count}</td>
          <td>${hms}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';

    refs.dashboardContentEl.innerHTML = html;
  }

  App.modules.TelefoniaDashboard = {
    showLoading,
    renderError,
    renderOverview,
    renderChamadasRecebidas,
    renderChamadasRealizadas
  };
})(window);