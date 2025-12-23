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
        App.state.activeViewId   = viewId || 'overview';

        // atualizar CSS de seleção no menu
        updateSidebarSelection(moduleId, App.state.activeViewId);

        // limpar filtros e conteúdo
        refs.filtersBarEl.innerHTML       = '';
        refs.dashboardContentEl.innerHTML = '<div class="placeholder">Carregando...</div>';

        // deixa o módulo desenhar filtros + dashboard
        if (typeof mod.renderFilters === 'function') {
            mod.renderFilters(refs.filtersBarEl, App.state.activeViewId);
        }
        if (typeof mod.loadAndRender === 'function') {
            mod.loadAndRender(App.state.activeViewId)
                .catch(err => {
                    log('Erro em módulo ' + moduleId + ': ' + err);
                    refs.dashboardContentEl.innerHTML =
                        '<div class="placeholder">Erro ao carregar dados.</div>';
                });
        }
    }

    function updateSidebarSelection(moduleId, viewId) {
        // módulo principal (botão grande)
        refs.sidebarModuleBtns.forEach(btn => {
            const m = btn.getAttribute('data-module');
            btn.classList.toggle('is-active', m === moduleId);
        });

        // subitens
        refs.sidebarSubBtns.forEach(btn => {
            const m = btn.getAttribute('data-module');
            const v = btn.getAttribute('data-view');
            btn.classList.toggle('is-active', m === moduleId && v === viewId);
        });
    }

    App.setActiveModule = setActiveModule;
})(window);