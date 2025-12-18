(function (global) {
    const App  = global.App = global.App || {};
    const refs = App.ui.refs || {};
    const log  = App.log || function(){};

    function safeNumber(n) {
        return (typeof n === 'number' && !isNaN(n)) ? n : 0;
    }

    function renderOverview(data) {
        if (!refs.dashboardContentEl) return;

        if (!data || !Array.isArray(data.callsByUser)) {
            refs.dashboardContentEl.innerHTML =
                '<div class="placeholder">Nenhum dado de chamadas encontrado para o período selecionado.</div>';
            return;
        }

        const totalCalls    = safeNumber(data.totalCalls);
        const answeredCalls = safeNumber(data.answeredCalls);
        const missedCalls   = safeNumber(data.missedCalls);

        const userRows = data.callsByUser.map(u => `
            <tr>
                <td>${u.userId}</td>
                <td>${safeNumber(u.total)}</td>
                <td>${safeNumber(u.answered)}</td>
                <td>${safeNumber(u.missed)}</td>
            </tr>
        `).join('') || '<tr><td colspan="4">Sem dados por usuário.</td></tr>';

        const statusRows = data.callsByStatus.map(s => `
            <tr>
                <td>${s.status}</td>
                <td>${safeNumber(s.total)}</td>
            </tr>
        `).join('') || '<tr><td colspan="2">Sem dados por status.</td></tr>';

        refs.dashboardContentEl.innerHTML = `
            <div class="cards-row">
                <div class="card kpi-card">
                    <div class="kpi-label">Total de chamadas</div>
                    <div class="kpi-value">${totalCalls}</div>
                </div>
                <div class="card kpi-card">
                    <div class="kpi-label">Chamadas atendidas</div>
                    <div class="kpi-value">${answeredCalls}</div>
                </div>
                <div class="card kpi-card">
                    <div class="kpi-label">Chamadas perdidas</div>
                    <div class="kpi-value">${missedCalls}</div>
                </div>
            </div>

            <div class="card">
                <h3>Chamadas por usuário (RESPONSIBLE_ID)</h3>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Usuário (ID)</th>
                                <th>Total</th>
                                <th>Atendidas</th>
                                <th>Perdidas</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${userRows}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <h3>Chamadas por status (DESCRIPTION)</h3>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Qtd</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${statusRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderChamadasRealizadas(data) {
        if (!refs.dashboardContentEl) return;
        const total = safeNumber(data && data.total);

        const rows = (data && Array.isArray(data.callsByUser))
            ? data.callsByUser.map(u => `
                <tr>
                    <td>${u.userId}</td>
                    <td>${safeNumber(u.total)}</td>
                </tr>
            `).join('')
            : '';

        const body = rows || '<tr><td colspan="2">Sem dados.</td></tr>';

        refs.dashboardContentEl.innerHTML = `
            <div class="card">
                <h3>Chamadas realizadas (saída)</h3>
                <p>Total de chamadas realizadas no período: <b>${total}</b></p>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Usuário (ID)</th>
                                <th>Total de chamadas</th>
                            </tr>
                        </thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderChamadasAtendidas(data) {
        if (!refs.dashboardContentEl) return;
        const total = safeNumber(data && data.total);

        const rows = (data && Array.isArray(data.callsByUser))
            ? data.callsByUser.map(u => `
                <tr>
                    <td>${u.userId}</td>
                    <td>${safeNumber(u.answered || u.total)}</td>
                </tr>
            `).join('')
            : '';

        const body = rows || '<tr><td colspan="2">Sem dados.</td></tr>';

        refs.dashboardContentEl.innerHTML = `
            <div class="card">
                <h3>Chamadas atendidas (saída)</h3>
                <p>Total de chamadas atendidas no período: <b>${total}</b></p>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Usuário (ID)</th>
                                <th>Chamadas atendidas</th>
                            </tr>
                        </thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    const TelefoniaDashboard = {
        renderOverview,
        renderChamadasRealizadas,
        renderChamadasAtendidas
    };

    App.modules = App.modules || {};
    App.modules.TelefoniaDashboard = TelefoniaDashboard;
})(window);