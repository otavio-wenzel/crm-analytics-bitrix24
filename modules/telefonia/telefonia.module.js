(function (global) {
    const App   = global.App = global.App || {};
    const log   = App.log || function(){};
    const refs  = App.ui.refs;

    const Service   = App.modules.TelefoniaService;
    const Dashboard = App.modules.TelefoniaDashboard;

    function renderFilters(container, viewId) {
        container.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
                <div>
                    <label>Período:</label><br>
                    <select id="filter-period">
                        <option value="today">Hoje</option>
                        <option value="7d">Últimos 7 dias</option>
                        <option value="30d" selected>Últimos 30 dias</option>
                        <option value="custom">Personalizado</option>
                    </select>
                </div>
                <!-- Futuro: usuário, direção, etc. -->
                <div>
                    <button id="btn-apply-filters" type="button">Aplicar filtros</button>
                </div>
            </div>
        `;
    }

    async function loadAndRender(viewId) {
        const filters = buildFilters();
        log('[TelefoniaModule] loadAndRender view=' + viewId, filters);

        if (viewId === 'overview') {
            const data = await Service.fetchOverview(filters);
            Dashboard.renderOverview(data);
        } else if (viewId === 'chamadas_realizadas') {
            const data = await Service.fetchChamadasRealizadas(filters);
            Dashboard.renderChamadasRealizadas(data);
        } else if (viewId === 'chamadas_atendidas') {
            const data = await Service.fetchChamadasAtendidas(filters);
            Dashboard.renderChamadasAtendidas(data);
        } else {
            Dashboard.renderOverview(await Service.fetchOverview(filters));
        }
    }

    function buildFilters() {
        const sel = document.getElementById('filter-period');
        const value = sel ? sel.value : '30d';
        return { period: value };
    }

    App.modules.telefonia = {
        id: 'telefonia',
        label: 'Telefonia',
        renderFilters,
        loadAndRender
    };
})(window);