(function (global) {
    const App  = global.App = global.App || {};
    const refs = App.ui.refs;

    const TelefoniaDashboard = {
        renderOverview(data) {
            const el = refs.dashboardContentEl;
            el.innerHTML = `
                <h2>Telefonia – Visão geral</h2>
                <p>Total de chamadas: <b>${data.totalCalls}</b></p>
                <p>Chamadas atendidas: <b>${data.answeredCalls}</b></p>
                <p>Chamadas não atendidas: <b>${data.missedCalls}</b></p>

                <h3>Por usuário</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Usuário</th>
                            <th>Total</th>
                            <th>Atendidas</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                            data.callsByUser.map(u => `
                                <tr>
                                    <td>${u.user}</td>
                                    <td>${u.total}</td>
                                    <td>${u.answered}</td>
                                </tr>
                            `).join('')
                        }
                    </tbody>
                </table>
            `;
        },

        renderChamadasRealizadas(data) {
            refs.dashboardContentEl.innerHTML = `
                <h2>Telefonia – Chamadas realizadas</h2>
                <p>Total de chamadas realizadas: <b>${data.total}</b></p>
                <p>(Em breve: tabela e gráficos detalhados.)</p>
            `;
        },

        renderChamadasAtendidas(data) {
            refs.dashboardContentEl.innerHTML = `
                <h2>Telefonia – Chamadas atendidas</h2>
                <p>Total de chamadas atendidas: <b>${data.total}</b></p>
                <p>(Em breve: distribuição por agente, horário, etc.)</p>
            `;
        }
    };

    App.modules.TelefoniaDashboard = TelefoniaDashboard;
})(window);