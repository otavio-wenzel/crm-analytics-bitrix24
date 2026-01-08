// events.js
(function (global) {
  const App  = global.App = global.App || {};
  const refs = App.ui.refs || {};
  const log  = App.log || function(){};

  App.state = App.state || {};

  // ✅ NOVO: EventBus simples
  App.events = App.events || (function () {
    const handlers = new Map();
    function on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => off(name, fn);
    }
    function off(name, fn) {
      const set = handlers.get(name);
      if (set) set.delete(fn);
    }
    function emit(name, payload) {
      const set = handlers.get(name);
      if (!set) return;
      for (const fn of set) {
        try { fn(payload); } catch (e) {}
      }
    }
    return { on, off, emit };
  })();

  // ✅ quando o watcher detectar nova ligação
  App.events.on('telefonia:calls_updated', function () {
    App.state.telefoniaNeedsRefresh = true;
    log('[UI] telefoniaNeedsRefresh = true (nova ligação detectada)');
  });

  function maybeForceFreshTelefonia() {
    if (!App.state.telefoniaNeedsRefresh) return;

    const Svc = App.modules && App.modules.TelefoniaService;
    if (Svc && typeof Svc.invalidateCache === 'function') {
      Svc.invalidateCache();
    }

    App.state.telefoniaNeedsRefresh = false;
    log('[UI] cache invalidado antes do load (force fresh)');
  }

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

        // ✅ se houve ligação nova, força refresh no próximo clique
        if (moduleId === 'telefonia') {
          maybeForceFreshTelefonia();
        }

        if (App.setActiveModule) {
          App.setActiveModule(moduleId, viewId);
        }
      });
    });
  }

  // Botão Aplicar filtros
  document.addEventListener('click', function (ev) {
    const target = ev.target;
    if (!target) return;

    if (target.id === 'btn-apply-filters') {
      ev.preventDefault();

      const moduleId = App.state.activeModuleId;
      const mod = App.modules && App.modules[moduleId];

      // ✅ se houve ligação nova, força refresh na próxima aplicação de filtros
      if (moduleId === 'telefonia') {
        maybeForceFreshTelefonia();
      }

      if (mod && typeof mod.loadAndRender === 'function') {
        mod.loadAndRender(App.state.activeViewId);
      }
    }
  });
})(window);