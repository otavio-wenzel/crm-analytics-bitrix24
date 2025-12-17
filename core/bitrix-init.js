(function (global) {
    const App  = global.App = global.App || {};
    const log  = App.log || function(){};
    const refs = App.ui.refs;

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

            // Admin autorizado: abre módulo padrão
            if (App.setActiveModule) {
                App.setActiveModule('telefonia', 'overview');
            }
        });
    });
})(window);