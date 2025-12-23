(function (global) {
  const App  = global.App = global.App || {};
  const refs = App.ui.refs || {};

  function toggleModuleMenu(moduleBtn) {
    const group = moduleBtn.closest('.sidebar-group');
    if (!group) return;

    const submenu = group.querySelector('.sidebar-submenu');
    if (!submenu) return;

    const isCollapsed = submenu.classList.contains('is-collapsed');

    if (isCollapsed) {
      submenu.classList.remove('is-collapsed');
      moduleBtn.classList.add('is-expanded');
    } else {
      submenu.classList.add('is-collapsed');
      moduleBtn.classList.remove('is-expanded');
    }
  }

  // Clique no módulo: só expande/colapsa
  if (refs.sidebarModuleBtns) {
    refs.sidebarModuleBtns.forEach(btn => {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        toggleModuleMenu(this);
      });
    });
  }

  // Clique nos subitens: carrega view
  if (refs.sidebarSubBtns) {
    refs.sidebarSubBtns.forEach(btn => {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        const moduleId = this.getAttribute('data-module');
        const viewId   = this.getAttribute('data-view');

        if (App.setActiveModule) {
          App.setActiveModule(moduleId, viewId);
        }
      });
    });
  }

  // Botão Aplicar filtros (continua igual)
  document.addEventListener('click', function (ev) {
    const target = ev.target;
    if (!target) return;

    if (target.id === 'btn-apply-filters') {
      ev.preventDefault();
      const moduleId = App.state.activeModuleId;
      const mod = App.modules && App.modules[moduleId];
      if (mod && typeof mod.loadAndRender === 'function') {
        mod.loadAndRender(App.state.activeViewId);
      }
    }
  });
})(window);