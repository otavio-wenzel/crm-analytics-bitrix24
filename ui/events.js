(function (global) {
    const App  = global.App = global.App || {};
    const refs = App.ui.refs;

    // Cliques em submenus (Telefonia etc.)
    if (refs.sidebarSubBtns) {
        refs.sidebarSubBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                const moduleId = this.getAttribute('data-module');
                const viewId   = this.getAttribute('data-view');
                if (App.setActiveModule) {
                    App.setActiveModule(moduleId, viewId);
                }
            });
        });
    }

    // Listener genérico para botão "Aplicar filtros" dos módulos
    document.addEventListener('click', function (ev) {
        const target = ev.target;
        if (!target) return;

        if (target.id === 'btn-apply-filters') {
            const moduleId = App.state.activeModuleId || 'telefonia';
            const mod = App.modules[moduleId];
            if (mod && typeof mod.loadAndRender === 'function') {
                mod.loadAndRender(App.state.activeViewId || 'overview');
            }
        }
    });
})(window);