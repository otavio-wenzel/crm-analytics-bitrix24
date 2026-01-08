//logging.js
(function (global) {
    const App = global.App = global.App || {};

    function log(msg, data) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2,'0');
        const mm = String(now.getMinutes()).padStart(2,'0');
        const ss = String(now.getSeconds()).padStart(2,'0');
        let line = `[${hh}:${mm}:${ss}] ${msg}`;

        if (data !== undefined) {
            try {
                if (Array.isArray(data)) {
                    line += ` [Array length=${data.length}]`;
                } else if (typeof data === 'object') {
                    line += ' ' + JSON.stringify(data);
                } else {
                    line += ' ' + String(data);
                }
            } catch (e) {
                line += ' ' + String(data);
            }
        }

        console.log(line);
    }

    App.log = log;

    window.addEventListener('error', function (ev) {
        const msg = ev.message || (ev.error && ev.error.message) || ev.error || '';
        log('JS ERROR GLOBAL', msg);
    });
})(window);