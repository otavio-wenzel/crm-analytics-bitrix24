(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  App.modules = App.modules || {};

  // CALL_TYPE (Voximplant)
  // 1 — outgoing
  // 2 — incoming
  // 3 — incoming redirected
  const CALLTYPE_OUTGOING = 1;
  const CALLTYPE_INCOMING = 2;
  const CALLTYPE_INCOMING_REDIRECTED = 3;

  function isoToSpace(dt) {
    return (dt && typeof dt === 'string') ? dt.replace('T', ' ') : dt;
  }

  // diff em dias (inteiro aproximado)
  function diffDays(fromIso, toIso) {
    const a = new Date(fromIso);
    const b = new Date(toIso);
    const ms = b - a;
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  function addDays(iso, days) {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    // mantém horário do iso original
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    const hh   = String(d.getHours()).padStart(2,'0');
    const mi   = String(d.getMinutes()).padStart(2,'0');
    const ss   = String(d.getSeconds()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  // Lista paginada com:
  // - timeout POR PÁGINA (resetado a cada retorno)
  // - timeout TOTAL opcional
  function callBx24ListAll(method, params, job, opts) {
    const timeoutPerPageMs = (opts && opts.timeoutPerPageMs) || 20000;
    const maxTotalMs       = (opts && opts.maxTotalMs) || 180000; // 3 min total
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const all = [];
      let done = false;
      let watchdog = null;

      function armWatchdog() {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error('TIMEOUT'));
        }, timeoutPerPageMs);
      }

      function finishOk(data) {
        clearTimeout(watchdog);
        done = true;
        resolve(data);
      }

      function finishErr(err) {
        clearTimeout(watchdog);
        done = true;
        reject(err);
      }

      function step() {
        if (done) return;

        if (job && job.canceled) {
          return finishErr(new Error('CANCELED'));
        }

        if ((Date.now() - startedAt) > maxTotalMs) {
          return finishErr(new Error('TIMEOUT'));
        }

        armWatchdog();

        BX24.callMethod(method, params, function (result) {
          if (done) return;

          if (job && job.canceled) {
            return finishErr(new Error('CANCELED'));
          }

          if (result.error && result.error()) {
            return finishErr(result.error());
          }

          const data = (typeof result.data === 'function') ? (result.data() || []) : [];
          if (data.length) all.push(...data);

          if ((Date.now() - startedAt) > maxTotalMs) {
            return finishErr(new Error('TIMEOUT'));
          }

          if (result.more && result.more()) {
            // reseta watchdog e vai pra próxima página
            armWatchdog();
            result.next();
          } else {
            finishOk(all);
          }
        });
      }

      step();
    });
  }

  // Busca chamadas no Voximplant. Para períodos grandes, quebra em blocos (7 dias)
  async function fetchCallHistory(filters, job) {
    const CHUNK_DAYS = 7;

    // se tiver intervalo definido, quebra em blocos
    const hasRange = !!(filters && filters.dateFrom && filters.dateTo);
    const chunks = [];

    if (hasRange) {
      const totalDays = diffDays(filters.dateFrom, filters.dateTo);
      if (totalDays > CHUNK_DAYS) {
        let cursorFrom = filters.dateFrom;
        while (new Date(cursorFrom) <= new Date(filters.dateTo)) {
          const cursorTo = addDays(cursorFrom, CHUNK_DAYS);
          // garante não passar do dateTo
          const cappedTo = (new Date(cursorTo) > new Date(filters.dateTo)) ? filters.dateTo : cursorTo;
          chunks.push({ dateFrom: cursorFrom, dateTo: cappedTo });
          // próximo bloco começa no dia seguinte do cappedTo (mantendo horário 00:00:00)
          cursorFrom = addDays(cappedTo, 1);
        }
      } else {
        chunks.push({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });
      }
    } else {
      // "all" (sem range): um único chunk (pode ser pesado)
      chunks.push({ dateFrom: null, dateTo: null });
    }

    let allCalls = [];

    for (const c of chunks) {
      if (job && job.canceled) throw new Error('CANCELED');

      const FILTER = {};
      if (c.dateFrom) FILTER[">=CALL_START_DATE"] = isoToSpace(c.dateFrom);
      if (c.dateTo)   FILTER["<=CALL_START_DATE"] = isoToSpace(c.dateTo);

      log('[TelefoniaService] voximplant.statistic.get FILTER', FILTER);

      const calls = await callBx24ListAll(
        'voximplant.statistic.get',
        { FILTER, SORT: 'CALL_START_DATE', ORDER: 'DESC' },
        job,
        { timeoutPerPageMs: 20000, maxTotalMs: 180000 }
      );

      allCalls = allCalls.concat(calls || []);
    }

    log('[TelefoniaService] total calls (voximplant) = ' + allCalls.length);
    return allCalls;
  }

  function isAnsweredFromVox(call) {
    const dur = parseInt(call.CALL_DURATION, 10);
    return Number.isFinite(dur) && dur > 0;
  }

  function directionBucket(call) {
    const t = parseInt(call.CALL_TYPE, 10) || 0;
    if (t === CALLTYPE_OUTGOING) return 'outbound';
    if (t === CALLTYPE_INCOMING || t === CALLTYPE_INCOMING_REDIRECTED) return 'inbound';
    return 'unknown';
  }

  function aggregateOverviewFromVox(calls) {
    const totals = {
      totalCalls: calls.length,
      inbound: 0,
      outbound: 0,
      unknown: 0,
      answered: 0,
      missed: 0
    };

    const byUser = {};
    const byStatus = {};

    calls.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const bucket = directionBucket(c);
      const ans = isAnsweredFromVox(c);

      if (bucket === 'inbound') totals.inbound++;
      else if (bucket === 'outbound') totals.outbound++;
      else totals.unknown++;

      if (!byUser[userId]) byUser[userId] = { userId, total: 0, answered: 0, missed: 0 };
      byUser[userId].total++;

      if (ans) {
        byUser[userId].answered++;
        totals.answered++;
      } else {
        byUser[userId].missed++;
        totals.missed++;
      }
    });

    return {
      totals,
      byUser: Object.values(byUser),
      byStatus: Object.values(byStatus)
    };
  }

  function aggregateInboundFromVox(calls) {
    const inbound = calls.filter(c => {
      const t = parseInt(c.CALL_TYPE, 10) || 0;
      return t === CALLTYPE_INCOMING || t === CALLTYPE_INCOMING_REDIRECTED;
    });

    const totals = { totalCalls: inbound.length, answered: 0, missed: 0 };
    const byUser = {};

    inbound.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const ans = isAnsweredFromVox(c);

      if (!byUser[userId]) byUser[userId] = { userId, total: 0, answered: 0, missed: 0 };
      byUser[userId].total++;

      if (ans) {
        byUser[userId].answered++;
        totals.answered++;
      } else {
        byUser[userId].missed++;
        totals.missed++;
      }
    });

    return { totals, byUser: Object.values(byUser) };
  }

  function aggregateOutboundFromVox(calls) {
    const outbound = calls.filter(c => (parseInt(c.CALL_TYPE, 10) || 0) === CALLTYPE_OUTGOING);

    const totals = { totalCalls: outbound.length, answered: 0, missed: 0 };
    const byUser = {};
    const byStatus = {};

    outbound.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const ans = isAnsweredFromVox(c);

      if (!byUser[userId]) byUser[userId] = { userId, total: 0, answered: 0, missed: 0 };
      byUser[userId].total++;

      if (ans) {
        byUser[userId].answered++;
        totals.answered++;
      } else {
        byUser[userId].missed++;
        totals.missed++;
      }

      const code = (c.CALL_FAILED_CODE || 'SEM_CODIGO').toString();
      byStatus[code] = byStatus[code] || { status: code, count: 0 };
      byStatus[code].count++;
    });

    return { totals, byUser: Object.values(byUser), byStatus: Object.values(byStatus) };
  }

  async function enrichWithUserNames(rows, job) {
    if (!rows || !rows.length) return rows;

    const ids = Array.from(new Set(
      rows.map(r => String(r.userId)).filter(id => id && id !== '0')
    ));

    if (!ids.length) return rows;

    const map = {};
    const CONCURRENCY = 5;
    let idx = 0;

    async function fetchOne(id) {
      if (job && job.canceled) throw new Error('CANCELED');

      const res = await new Promise((resolve, reject) => {
        BX24.callMethod('user.get', { ID: id }, function (r) {
          if (r.error && r.error()) reject(r.error());
          else resolve(r);
        });
      });

      const list = (typeof res.data === 'function') ? (res.data() || []) : [];
      const u = list[0];
      if (u) {
        const fullName = (u.NAME + ' ' + (u.LAST_NAME || '')).trim();
        map[id] = fullName || id;
      }
    }

    async function worker() {
      while (idx < ids.length) {
        if (job && job.canceled) throw new Error('CANCELED');
        const id = ids[idx++];
        try {
          await fetchOne(id);
        } catch (e) {
          log('[TelefoniaService] erro user.get ID=' + id, e);
        }
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, ids.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    rows.forEach(r => {
      const id = String(r.userId);
      r.userName = map[id] ? `${map[id]} (${id})` : id;
    });

    return rows;
  }

  const TelefoniaService = {
    async fetchOverview(filters, job) {
      const calls = await fetchCallHistory(filters, job);
      const agg = aggregateOverviewFromVox(calls);
      agg.byUser = await enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchChamadasRecebidas(filters, job) {
      const calls = await fetchCallHistory(filters, job);
      const agg = aggregateInboundFromVox(calls);
      agg.byUser = await enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchChamadasRealizadas(filters, job) {
      const calls = await fetchCallHistory(filters, job);
      const agg = aggregateOutboundFromVox(calls);
      agg.byUser = await enrichWithUserNames(agg.byUser, job);
      return agg;
    }
  };

  App.modules.TelefoniaService = TelefoniaService;
})(window);