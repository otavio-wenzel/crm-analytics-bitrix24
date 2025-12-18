(function (global) {
    const App = global.App = global.App || {};
    const log = App.log || function(){};

    const Service   = App.modules.TelefoniaService;
    const Dashboard = App.modules.TelefoniaDashboard;

    function renderFilters(container, viewId) {
        if (!container) return;

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

                <!-- Futuro: filtro por usuário, direção, etc. -->

                <div>
                    <button id="btn-apply-filters" type="button">Aplicar filtros</button>
                </div>
            </div>
        `;
    }

    function buildFilters() {
        const sel = document.getElementById('filter-period');
        const periodValue = sel ? sel.value : '30d';

        const filters = { period: periodValue };

        // Futuro: ler inputs de data se period === 'custom'
        return filters;
    }

    async function loadAndRender(viewId) {
        const filters = buildFilters();
        log('[TelefoniaModule] loadAndRender view=' + viewId, filters);

        try {
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
                const data = await Service.fetchOverview(filters);
                Dashboard.renderOverview(data);
            }
        } catch (e) {
            log('[TelefoniaModule] ERRO em loadAndRender', e && e.message ? e.message : e);
            const refs = App.ui.refs || {};
            if (refs.dashboardContentEl) {
                refs.dashboardContentEl.innerHTML =
                    '<div class="placeholder">Erro ao carregar dados de telefonia. Veja o console/log.</div>';
            }
        }
    }

    App.modules.telefonia = {
        id: 'telefonia',
        label: 'Telefonia',
        renderFilters,
        loadAndRender
    };
})(window);