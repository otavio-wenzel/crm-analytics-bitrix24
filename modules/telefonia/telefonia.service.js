(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  App.modules = App.modules || {};
  App.state = App.state || {};
  App.state.telefoniaCache = App.state.telefoniaCache || {
    users: null,
    usersTs: 0,
    userNameMap: new Map()
  };

  const CALLTYPE_OUTGOING = 1;
  const CALLTYPE_INCOMING = 2;
  const CALLTYPE_INCOMING_REDIRECTED = 3;

  function isoToSpace(dt) {
    return (dt && typeof dt === 'string') ? dt.replace('T', ' ') : dt;
  }

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

  // ===== pipeline de filtros =====
  function buildVoxFilter(filters) {
    const FILTER = {};
    if (filters.collaboratorId) FILTER["PORTAL_USER_ID"] = String(filters.collaboratorId);
    if (filters.dateFrom) FILTER[">=CALL_START_DATE"] = isoToSpace(filters.dateFrom);
    if (filters.dateTo)   FILTER["<=CALL_START_DATE"] = isoToSpace(filters.dateTo);
    return FILTER;
  }

  // ===== chunking de datas =====
  function addDays(iso, days) {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    const hh   = String(d.getHours()).padStart(2,'0');
    const mi   = String(d.getMinutes()).padStart(2,'0');
    const ss   = String(d.getSeconds()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  // ✅ NOVO: soma segundos (usado para fechar chunk sem “buracos”)
  function addSeconds(iso, seconds) {
    const d = new Date(iso);
    d.setSeconds(d.getSeconds() + seconds);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    const hh   = String(d.getHours()).padStart(2,'0');
    const mi   = String(d.getMinutes()).padStart(2,'0');
    const ss   = String(d.getSeconds()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  // ✅ CORRIGIDO: chunks contínuos, sem pular dias/horas/segundos
  // Estratégia:
  // - nextStart = cursorFrom + chunkDays
  // - chunkEnd = nextStart - 1 segundo (fecha no 23:59:59 do dia anterior)
  // - próximo cursorFrom = nextStart (sem addDays(cappedTo, 1))
  function makeChunks(dateFrom, dateTo, chunkDays) {
    const chunks = [];
    let cursorFrom = dateFrom;

    while (new Date(cursorFrom) <= new Date(dateTo)) {
      const nextStart = addDays(cursorFrom, chunkDays);
      const chunkEnd  = addSeconds(nextStart, -1);

      const cappedTo = (new Date(chunkEnd) > new Date(dateTo)) ? dateTo : chunkEnd;

      chunks.push({ dateFrom: cursorFrom, dateTo: cappedTo });

      cursorFrom = nextStart;
    }

    return chunks;
  }

  async function fetchChunk(filters, job, chunk) {
    const FILTER = buildVoxFilter({
      ...filters,
      dateFrom: chunk.dateFrom,
      dateTo: chunk.dateTo
    });

    log('[TelefoniaService] CHUNK FILTER', FILTER);

    return await callBx24ListAll(
      'voximplant.statistic.get',
      { FILTER, SORT: 'CALL_START_DATE', ORDER: 'DESC' },
      job,
      // ✅ 365 dias pode precisar mais tempo total
      { timeoutPerPageMs: 30000, maxTotalMs: 240000 }
    );
  }

  async function fetchCallHistory(filters, job) {
    if (filters.dateFrom && filters.dateTo) {
      // chunk padrão 7 dias
      const firstChunks = makeChunks(filters.dateFrom, filters.dateTo, 7);

      let all = [];
      for (const ch of firstChunks) {
        if (job && job.canceled) throw new Error('CANCELED');

        try {
          const part = await fetchChunk(filters, job, ch);
          all = all.concat(part || []);
        } catch (e) {
          const msg = (e && e.message) ? e.message : String(e || '');
          if (msg === 'TIMEOUT') {
            // fallback: quebra esse chunk em 3 dias
            const fallbackChunks = makeChunks(ch.dateFrom, ch.dateTo, 3);
            for (const fb of fallbackChunks) {
              if (job && job.canceled) throw new Error('CANCELED');
              const part2 = await fetchChunk(filters, job, fb);
              all = all.concat(part2 || []);
            }
          } else {
            throw e;
          }
        }
      }

      log('[TelefoniaService] total calls = ' + all.length);
      return all;
    }

    // Sem range (não deveria mais existir, já removemos "desde sempre")
    return [];
  }

  function safeDurationSec(call) {
    const dur = parseInt(call.CALL_DURATION, 10);
    return Number.isFinite(dur) && dur > 0 ? dur : 0;
  }

  function directionBucket(call) {
    const t = parseInt(call.CALL_TYPE, 10) || 0;
    if (t === CALLTYPE_OUTGOING) return 'outbound';
    if (t === CALLTYPE_INCOMING || t === CALLTYPE_INCOMING_REDIRECTED) return 'inbound';
    return 'unknown';
  }

  function ensureUser(byUser, userId) {
    if (!byUser[userId]) {
      byUser[userId] = { userId, total: 0, answered: 0, missed: 0, totalDurationSeconds: 0 };
    }
    return byUser[userId];
  }

  function aggregateOverviewFromVox(calls) {
    const totals = {
      totalCalls: calls.length,
      inbound: 0,
      outbound: 0,
      unknown: 0,
      answered: 0,
      missed: 0,
      totalDurationSeconds: 0
    };

    const byUser = {};
    const byStatus = {};

    calls.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const bucket = directionBucket(c);
      const durSec = safeDurationSec(c);
      const ans = durSec > 0;

      if (bucket === 'inbound') totals.inbound++;
      else if (bucket === 'outbound') totals.outbound++;
      else totals.unknown++;

      const u = ensureUser(byUser, userId);
      u.total++;
      u.totalDurationSeconds += durSec;

      totals.totalDurationSeconds += durSec;

      if (ans) { u.answered++; totals.answered++; }
      else { u.missed++; totals.missed++; }
    });

    return { totals, byUser: Object.values(byUser), byStatus: Object.values(byStatus) };
  }

  function aggregateInboundFromVox(calls) {
    const inbound = calls.filter(c => {
      const t = parseInt(c.CALL_TYPE, 10) || 0;
      return t === CALLTYPE_INCOMING || t === CALLTYPE_INCOMING_REDIRECTED;
    });

    const totals = { totalCalls: inbound.length, answered: 0, missed: 0, totalDurationSeconds: 0 };
    const byUser = {};

    inbound.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const durSec = safeDurationSec(c);
      const ans = durSec > 0;

      const u = ensureUser(byUser, userId);
      u.total++;
      u.totalDurationSeconds += durSec;

      totals.totalDurationSeconds += durSec;

      if (ans) { u.answered++; totals.answered++; }
      else { u.missed++; totals.missed++; }
    });

    return { totals, byUser: Object.values(byUser) };
  }

  function aggregateOutboundFromVox(calls) {
    const outbound = calls.filter(c => (parseInt(c.CALL_TYPE, 10) || 0) === CALLTYPE_OUTGOING);

    const totals = { totalCalls: outbound.length, answered: 0, missed: 0, totalDurationSeconds: 0 };
    const byUser = {};
    const byStatus = {};

    outbound.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const durSec = safeDurationSec(c);
      const ans = durSec > 0;

      const u = ensureUser(byUser, userId);
      u.total++;
      u.totalDurationSeconds += durSec;

      totals.totalDurationSeconds += durSec;

      if (ans) { u.answered++; totals.answered++; }
      else { u.missed++; totals.missed++; }

      const code = (c.CALL_FAILED_CODE || 'SEM_CODIGO').toString();
      if (!byStatus[code]) byStatus[code] = { status: code, count: 0, totalDurationSeconds: 0 };
      byStatus[code].count++;
      byStatus[code].totalDurationSeconds += durSec;
    });

    return { totals, byUser: Object.values(byUser), byStatus: Object.values(byStatus) };
  }

  async function enrichWithUserNames(rows, job) {
    if (!rows || !rows.length) return rows;

    const ids = Array.from(new Set(
      rows.map(r => String(r.userId)).filter(id => id && id !== '0')
    ));
    if (!ids.length) return rows;

    const nameMap = App.state.telefoniaCache.userNameMap;
    const missing = ids.filter(id => !nameMap.has(id));

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
        nameMap.set(id, fullName ? `${fullName} (${id})` : id);
      }
    }

    async function worker() {
      while (idx < missing.length) {
        if (job && job.canceled) throw new Error('CANCELED');
        const id = missing[idx++];
        try { await fetchOne(id); }
        catch (e) { log('[TelefoniaService] erro user.get ID=' + id, e); }
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, missing.length); i++) workers.push(worker());
    await Promise.all(workers);

    rows.forEach(r => {
      const id = String(r.userId);
      r.userName = nameMap.get(id) || id;
    });

    return rows;
  }

  async function getActiveCollaborators(job) {
    const now = Date.now();
    const TTL = 10 * 60 * 1000;

    if (App.state.telefoniaCache.users && (now - App.state.telefoniaCache.usersTs) < TTL) {
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
    return normalized;
  }

  const TelefoniaService = {
    getActiveCollaborators,

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