(function (global) {
    const App  = global.App = global.App || {};
    const refs = App.ui.refs || {};

    // Marca subitem ativo visualmente
    function setActiveSidebarButton(clickedBtn) {
        if (!refs.sidebarSubBtns) return;
        refs.sidebarSubBtns.forEach(btn => btn.classList.remove('is-active'));
        if (clickedBtn) clickedBtn.classList.add('is-active');
    }

    // Cliques em submenus (Telefonia etc.)
    if (refs.sidebarSubBtns) {
        refs.sidebarSubBtns.forEach(btn => {
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                const moduleId = this.getAttribute('data-module');
                const viewId   = this.getAttribute('data-view');
                setActiveSidebarButton(this);
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
            ev.preventDefault();
            const moduleId = App.state.activeModuleId || 'telefonia';
            const mod = App.modules && App.modules[moduleId];
            if (mod && typeof mod.loadAndRender === 'function') {
                mod.loadAndRender(App.state.activeViewId || 'overview');
            }
        }
    });
})(window);