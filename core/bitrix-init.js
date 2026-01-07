// bitrix-init.js
(function (global) {
  const App  = global.App = global.App || {};
  const log  = App.log || function(){};
  const refs = App.ui.refs || {};

  App.state = App.state || {};

  BX24.init(function() {
    log('BX24.init OK. Pronto para usar API.');

    BX24.callMethod('user.current', {}, function(res) {
      if (res.error && res.error()) {
        log('user.current ERRO', res.error());
        if (refs.dashboardContentEl) {
          refs.dashboardContentEl.innerHTML =
            '<div class="placeholder">Erro ao obter usuário atual.</div>';
        }
        return;
      }

      const user = res.data();
      App.state.CURRENT_USER_ID = parseInt(user.ID, 10);

      try {
        if (typeof BX24.isAdmin === 'function') {
          App.state.IS_ADMIN = !!BX24.isAdmin();
        } else if (user && (user.ADMIN === true || user.IS_ADMIN === 'Y')) {
          App.state.IS_ADMIN = true;
        } else {
          App.state.IS_ADMIN = false;
        }
      } catch (e) {
        App.state.IS_ADMIN = false;
      }

      log('user.current SUCESSO, ID=' + App.state.CURRENT_USER_ID, {
        ID: user.ID,
        NAME: user.NAME,
        LAST_NAME: user.LAST_NAME
      });
      log('IS_ADMIN = ' + App.state.IS_ADMIN);

      if (refs.headerUserInfoEl) {
        const fullName = (user.NAME + ' ' + (user.LAST_NAME || '')).trim();
        refs.headerUserInfoEl.textContent =
          (App.state.IS_ADMIN ? 'Admin: ' : '') + fullName;
      }

      if (!App.state.IS_ADMIN) {
        if (refs.sidebarModuleBtns) {
          refs.sidebarModuleBtns.forEach(btn => btn.disabled = true);
        }
        if (refs.dashboardContentEl) {
          refs.dashboardContentEl.innerHTML =
            '<div class="placeholder">Este painel é exclusivo para administradores.</div>';
        }
        return;
      }

      // ✅ Start watcher (apenas 1 vez) — depois do admin autorizado
      try {
        const Svc = App.modules && App.modules.TelefoniaService;
        if (Svc && typeof Svc.startWatcher === 'function') {
          // configurações default seguras
          Svc.startWatcher({
            intervalMs: 20000,      // 20s
            lookbackHours: 48,      // olha últimas 48h (1 página, leve)
            skipWhenHidden: true    // não faz poll quando a aba está oculta
          });
        }
      } catch (e) {
        log('[bitrix-init] Falha ao iniciar watcher', e);
      }

      // ✅ (opcional) pausar/retomar ao esconder/exibir aba
      try {
        document.addEventListener('visibilitychange', function () {
          const Svc = App.modules && App.modules.TelefoniaService;
          if (!Svc) return;

          if (document.hidden) {
            if (typeof Svc.stopWatcher === 'function') Svc.stopWatcher();
          } else {
            if (typeof Svc.startWatcher === 'function') {
              Svc.startWatcher({
                intervalMs: 20000,
                lookbackHours: 48,
                skipWhenHidden: true
              });
            }
          }
        });
      } catch (e) {
        // silencioso
      }

      // Admin autorizado: abre módulo padrão (Telefonia / "menu fechado" => view null)
      if (typeof App.setActiveModule === 'function') {
        App.setActiveModule('telefonia', null);
      } else if (App.modules && App.modules.telefonia) {
        // fallback se o router ainda não estiver pronto
        const mod = App.modules.telefonia;
        if (mod.renderFilters && refs.filtersBarEl) {
          mod.renderFilters(refs.filtersBarEl, 'overview');
        }
        if (typeof mod.loadAndRender === 'function') {
          mod.loadAndRender('overview');
        }
      }
    });
  });
})(window);