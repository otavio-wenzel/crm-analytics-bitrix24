(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  App.modules = App.modules || {};

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

  async function getCallActivities(dateFrom, dateTo, responsibleIds, descriptionLike, job) {
    function isoToSpace(dt) {
      return (dt && typeof dt === 'string') ? dt.replace('T', ' ') : dt;
    }

    const filter = {
      TYPE_ID: 2,
      ">=START_TIME": isoToSpace(dateFrom),
      "<=START_TIME": isoToSpace(dateTo)
    };

    // ⚡️ filtro por descrição (server-side)
    if (descriptionLike) {
      filter["%DESCRIPTION"] = String(descriptionLike);
    }

    if (Array.isArray(responsibleIds) && responsibleIds.length === 1) {
      filter.RESPONSIBLE_ID = String(responsibleIds[0]);
    } else if (Array.isArray(responsibleIds) && responsibleIds.length > 1) {
      filter.RESPONSIBLE_ID = responsibleIds.map(String);
    }

    const params = {
      order: { START_TIME: "DESC" },
      filter,
      // pega só o necessário (menos payload)
      select: [
        "ID",
        "DESCRIPTION",
        "RESPONSIBLE_ID",
        "START_TIME",
        "COMMUNICATIONS"
      ]
    };

    return await callBx24ListAll("crm.activity.list", params, job, {
      timeoutPerPageMs: 30000,
      maxTotalMs: 180000
    });
  }

  App.modules.TelefoniaProviderCRM = { getCallActivities };
})(window);