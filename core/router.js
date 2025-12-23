(function (global) {
    const App  = global.App = global.App || {};
    const log  = App.log || function(){};
    const refs = App.ui.refs;

    App.state.activeModuleId = App.state.activeModuleId || 'telefonia';
    App.state.activeViewId   = App.state.activeViewId   || 'overview';

    function setActiveModule(moduleId, viewId) {
        const mod = App.modules[moduleId];
        if (!mod) {
            log('Módulo não encontrado: ' + moduleId);
            return;
        }

        App.state.activeModuleId = moduleId;
        App.state.activeViewId   = viewId || null;

        updateSidebarSelection(moduleId, viewId);

        // Se não tem view, tela em branco (não carrega nada)
        if (!viewId) {
            refs.filtersBarEl.innerHTML = '';
            refs.dashboardContentEl.innerHTML =
            '<div class="placeholder">Selecione um relatório no menu para exibir os dados.</div>';
            return;
        }

        refs.filtersBarEl.innerHTML       = '';
        refs.dashboardContentEl.innerHTML = '<div class="placeholder">Carregando...</div>';

        if (typeof mod.renderFilters === 'function') {
            mod.renderFilters(refs.filtersBarEl, viewId);
        }
        if (typeof mod.loadAndRender === 'function') {
            mod.loadAndRender(viewId)
            .catch(err => {
                log('Erro em módulo ' + moduleId + ': ' + err);
                refs.dashboardContentEl.innerHTML =
                '<div class="placeholder">Erro ao carregar dados.</div>';
            });
        }
    }

    function updateSidebarSelection(moduleId, viewId) {
        refs.sidebarModuleBtns.forEach(btn => {
            const m = btn.getAttribute('data-module');
            btn.classList.toggle('is-active', m === moduleId);
        });

        refs.sidebarSubBtns.forEach(btn => {
            const m = btn.getAttribute('data-module');
            const v = btn.getAttribute('data-view');
            btn.classList.toggle('is-active', !!viewId && m === moduleId && v === viewId);
        });
    }

    App.setActiveModule = setActiveModule;
})(window);