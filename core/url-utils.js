(function (global) {
    const App = global.App = global.App || {};
    const log = App.log || function(){};

    function getBaseUrls() {
        const full = window.location.href.split('#')[0].split('?')[0];
        const idx  = full.lastIndexOf('/');

        const appBase = full.substring(0, idx + 1);
        const noSlash = appBase.endsWith('/') ? appBase.slice(0, -1) : appBase;
        const idx2    = noSlash.lastIndexOf('/');
        const rootBase= noSlash.substring(0, idx2 + 1);

        return { appBase, rootBase };
    }

    const bases = getBaseUrls();

    App.config.APP_BASE_URL   = bases.appBase;
    App.config.ROOT_BASE_URL  = bases.rootBase;

    App.getBaseUrl = function () {
        return App.config.APP_BASE_URL;
    };

    log('[INIT] APP_BASE_URL  = ' + App.config.APP_BASE_URL);
    log('[INIT] ROOT_BASE_URL = ' + App.config.ROOT_BASE_URL);
})(window);