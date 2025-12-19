(function (global) {
  const App  = global.App = global.App || {};
  const refs = App.ui.refs;
  const log  = App.log || function(){};

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

    let html = '';

    html += '<h3>Visão geral de chamadas</h3>';
    html += `<p>
      Total de chamadas: ${data.totals.totalCalls}<br>
      Chamadas recebidas (entrada): ${data.totals.inbound}<br>
      Chamadas realizadas (saída): ${data.totals.outbound}
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
        </tr>
      `;
    });
    html += '</tbody></table>';

    html += '<h4>Status das chamadas realizadas</h4>';
    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Qtd</th>
          </tr>
        </thead>
        <tbody>
    `;
    (data.byStatus || []).forEach(row => {
      html += `
        <tr>
          <td>${row.status}</td>
          <td>${row.count}</td>
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

    let html = '';

    html += '<h3>Chamadas recebidas</h3>';
    html += `<p>
      Total de chamadas recebidas: ${data.totals.totalCalls}<br>
      Atendidas: ${data.totals.answered}<br>
      Perdidas: ${data.totals.missed}
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

    let html = '';

    html += '<h3>Chamadas realizadas (saída)</h3>';
    html += `<p>
      Total de chamadas realizadas: ${data.totals.totalCalls}<br>
      Atendidas: ${data.totals.answered}<br>
      Não atendidas / perdidas: ${data.totals.missed}
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
        </tr>
      `;
    });
    html += '</tbody></table>';

    html += '<h4>Status das chamadas realizadas</h4>';
    html += `
      <table class="simple-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Qtd</th>
          </tr>
        </thead>
        <tbody>
    `;
    (data.byStatus || []).forEach(row => {
      html += `
        <tr>
          <td>${row.status}</td>
          <td>${row.count}</td>
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