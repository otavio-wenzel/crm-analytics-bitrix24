(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  App.modules = App.modules || {};
  App.state = App.state || {};

  function callBx24ListAll(method, params, job, opts) {
    const timeoutPerPageMs = (opts && opts.timeoutPerPageMs) || 30000;
    const maxTotalMs       = (opts && opts.maxTotalMs) || 180000;

    const startedAt = Date.now();
    const all = [];

    return new Promise((resolve, reject) => {
      let done = false;
      let watchdog = null;

      function arm() {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error('TIMEOUT'));
        }, timeoutPerPageMs);
      }

      function finishOk() {
        clearTimeout(watchdog);
        done = true;
        resolve(all);
      }

      function finishErr(err) {
        clearTimeout(watchdog);
        done = true;
        reject(err);
      }

      arm();

      BX24.callMethod(method, params, function (result) {
        if (done) return;

        if (job && job.canceled) return finishErr(new Error('CANCELED'));
        if ((Date.now() - startedAt) > maxTotalMs) return finishErr(new Error('TIMEOUT'));
        if (result.error && result.error()) return finishErr(result.error());

        const data = (typeof result.data === 'function') ? (result.data() || []) : [];
        if (data.length) all.push(...data);

        if (result.more && result.more()) {
          arm();
          result.next();
        } else {
          finishOk();
        }
      });
    });
  }

  async function getCalls(filterObj, job, opts) {
    return await callBx24ListAll(
      'voximplant.statistic.get',
      { FILTER: filterObj, SORT: 'CALL_START_DATE', ORDER: 'DESC' },
      job,
      opts || { timeoutPerPageMs: 30000, maxTotalMs: 180000 }
    );
  }

  async function getActiveCollaborators(job) {
    const now = Date.now();
    const TTL = 10 * 60 * 1000;

    App.state.telefoniaCache = App.state.telefoniaCache || {};
    if (App.state.telefoniaCache.users && (now - (App.state.telefoniaCache.usersTs || 0)) < TTL) {
      return App.state.telefoniaCache.users;
    }

    const users = await callBx24ListAll(
      'user.get',
      { filter: { ACTIVE: 'Y' }, select: ['ID','NAME','LAST_NAME'] },
      job,
      { timeoutPerPageMs: 30000, maxTotalMs: 60000 }
    );

    const normalized = (users || [])
      .map(u => ({
        ID: String(u.ID),
        NAME: ((u.NAME || '') + ' ' + (u.LAST_NAME || '')).trim() || String(u.ID)
      }))
      .sort((a,b) => a.NAME.localeCompare(b.NAME));

    App.state.telefoniaCache.users = normalized;
    App.state.telefoniaCache.usersTs = Date.now();

    log('[VoxProvider] active users=' + normalized.length);
    return normalized;
  }

  App.modules.TelefoniaProviderVox = {
    getCalls,
    getActiveCollaborators
  };
})(window);