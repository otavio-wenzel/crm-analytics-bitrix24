(function (global) {
  const App  = global.App = global.App || {};
  const refs = App.ui && App.ui.refs ? App.ui.refs : {};

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

  function renderOverview(data) {
    if (!refs.dashboardContentEl) return;
    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhum dado encontrado para o período selecionado.</div>';
      return;
    }

    const t = data.totals;
    const totalHms = formatHMS(t.totalDurationSeconds);

    let html = '';
    html += '<h3>Visão geral de chamadas</h3>';
    html += `<p>
      Total de chamadas: ${t.totalCalls}<br>
      Chamadas recebidas (entrada): ${t.inbound}<br>
      Chamadas realizadas (saída): ${t.outbound}<br>
      Tempo total (hh:mm:ss): <strong>${totalHms}</strong>
      ${typeof t.unknown === 'number' ? `<br>Desconhecidas: ${t.unknown}` : ''}
    </p>`;

    html += '<h4>Chamadas por usuário</h4>';
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
      html += `
        <tr>
          <td>${label}</td>
          <td>${row.total}</td>
          <td>${row.answered}</td>
          <td>${row.missed}</td>
          <td>${formatHMS(row.totalDurationSeconds)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    refs.dashboardContentEl.innerHTML = html;
  }

  function renderChamadasRecebidas(data) {
    if (!refs.dashboardContentEl) return;
    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhuma chamada recebida no período.</div>';
      return;
    }

    const t = data.totals;
    let html = '';
    html += '<h3>Chamadas recebidas</h3>';
    html += `<p>
      Total: ${t.totalCalls}<br>
      Atendidas: ${t.answered}<br>
      Perdidas: ${t.missed}<br>
      Tempo total (hh:mm:ss): <strong>${formatHMS(t.totalDurationSeconds)}</strong>
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
      html += `
        <tr>
          <td>${label}</td>
          <td>${row.total}</td>
          <td>${row.answered}</td>
          <td>${row.missed}</td>
          <td>${formatHMS(row.totalDurationSeconds)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    refs.dashboardContentEl.innerHTML = html;
  }

  function renderChamadasRealizadas(data) {
    if (!refs.dashboardContentEl) return;
    if (!data || !data.totals) {
      refs.dashboardContentEl.innerHTML =
        '<div class="placeholder">Nenhuma chamada realizada no período.</div>';
      return;
    }

    const t = data.totals;
    let html = '';
    html += '<h3>Chamadas realizadas (saída)</h3>';
    html += `<p>
      Total: ${t.totalCalls}<br>
      Atendidas: ${t.answered}<br>
      Não atendidas / perdidas: ${t.missed}<br>
      Tempo total (hh:mm:ss): <strong>${formatHMS(t.totalDurationSeconds)}</strong>
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
      html += `
        <tr>
          <td>${label}</td>
          <td>${row.total}</td>
          <td>${row.answered}</td>
          <td>${row.missed}</td>
          <td>${formatHMS(row.totalDurationSeconds)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';

    // status técnico por CALL_FAILED_CODE
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
      html += `
        <tr>
          <td>${row.status}</td>
          <td>${row.count}</td>
          <td>${formatHMS(row.totalDurationSeconds)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    refs.dashboardContentEl.innerHTML = html;
  }

  App.modules = App.modules || {};
  App.modules.TelefoniaDashboard = {
    showLoading,
    renderError,
    renderOverview,
    renderChamadasRecebidas,
    renderChamadasRealizadas
  };
})(window);