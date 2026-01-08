//router.js
(function (global) {
  const App  = global.App = global.App || {};
  const log  = App.log || function(){};
  const refs = App.ui.refs;

  App.state.activeModuleId = App.state.activeModuleId || 'telefonia';
  App.state.activeViewId   = App.state.activeViewId   || 'overview';

  function safeCancelModule(moduleId) {
    if (!moduleId) return;
    const mod = App.modules && App.modules[moduleId];
    if (mod && typeof mod.cancelAll === 'function') {
      try {
        mod.cancelAll();
        log('[Router] cancelAll() chamado para módulo: ' + moduleId);
      } catch (e) {
        log('[Router] erro ao cancelar módulo ' + moduleId, e);
      }
    }
  }

  function setActiveModule(moduleId, viewId) {
    const nextModuleId = moduleId;
    const nextViewId   = viewId || null;

    const prevModuleId = App.state.activeModuleId;
    const prevViewId   = App.state.activeViewId;

    const mod = App.modules[nextModuleId];
    if (!mod) {
      log('Módulo não encontrado: ' + nextModuleId);
      return;
    }

    // ✅ Se realmente mudou (módulo ou view), cancela o que estava rodando no módulo anterior
    const changed = (prevModuleId !== nextModuleId) || (prevViewId !== nextViewId);
    if (changed) {
      safeCancelModule(prevModuleId);
    }

    App.state.activeModuleId = nextModuleId;
    App.state.activeViewId   = nextViewId;

    updateSidebarSelection(nextModuleId, nextViewId);

    // Se viewId for null, é só estado "selecione um relatório"
    if (!nextViewId) {
      if (refs.filtersBarEl) refs.filtersBarEl.innerHTML = '';
      if (refs.dashboardContentEl) {
        refs.dashboardContentEl.innerHTML =
          '<div class="placeholder">Selecione um relatório no menu para exibir os dados.</div>';
      }
      return;
    }

    // Estado inicial de carregamento da view
    if (refs.filtersBarEl) refs.filtersBarEl.innerHTML = '';
    if (refs.dashboardContentEl) refs.dashboardContentEl.innerHTML = '<div class="placeholder">Carregando...</div>';

    if (typeof mod.renderFilters === 'function') {
      mod.renderFilters(refs.filtersBarEl, nextViewId);
    }

    if (typeof mod.loadAndRender === 'function') {
      mod.loadAndRender(nextViewId)
        .catch(err => {
          log('Erro em módulo ' + nextModuleId + ': ' + err);
          if (refs.dashboardContentEl) {
            refs.dashboardContentEl.innerHTML =
              '<div class="placeholder">Erro ao carregar dados.</div>';
          }
        });
    }
  }

  function updateSidebarSelection(moduleId, viewId) {
    if (refs.sidebarModuleBtns) {
      refs.sidebarModuleBtns.forEach(btn => {
        const m = btn.getAttribute('data-module');
        btn.classList.toggle('is-active', m === moduleId);
      });
    }

    if (refs.sidebarSubBtns) {
      refs.sidebarSubBtns.forEach(btn => {
        const m = btn.getAttribute('data-module');
        const v = btn.getAttribute('data-view');
        btn.classList.toggle('is-active', !!viewId && m === moduleId && v === viewId);
      });
    }
  }

  // ✅ helper para recarregar a view atual
  App.reloadActiveView = function (opts) {
    opts = opts || {};
    const moduleId = App.state.activeModuleId;
    const viewId   = App.state.activeViewId;

    const mod = App.modules && App.modules[moduleId];
    if (!mod || !viewId || typeof mod.loadAndRender !== 'function') return;

    // força fresh de telefonia
    if (opts.forceFresh && moduleId === 'telefonia') {
      const Svc = App.modules && App.modules.TelefoniaService;
      if (Svc && typeof Svc.invalidateCache === 'function') {
        Svc.invalidateCache();
      }
    }

    mod.loadAndRender(viewId).catch(err => {
      log('Erro em reloadActiveView: ' + err);
    });
  };

  App.setActiveModule = setActiveModule;
})(window);