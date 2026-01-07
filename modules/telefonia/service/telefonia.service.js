// telefonia.service.js
(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  const Core            = App.modules.TelefoniaCore;
  const PeriodFilter    = App.modules.TelefoniaFilterPeriod;
  const CollabFilter    = App.modules.TelefoniaFilterCollaborator;
  const CallTypeFilter  = App.modules.TelefoniaFilterCallType;

  const Provider = App.modules.TelefoniaProviderVox;

  // =======================
  // DISPOSITIONS (Call Disposition)
  // =======================
  const DISPOSITIONS = [
    "REUNIÃO AGENDADA",
    "FALEI COM SECRETÁRIA",
    "FOLLOW-UP",
    "RETORNO POR E-MAIL",
    "NÃO TEM INTERESSE",
    "NÃO FAZ LOCAÇÃO",
    "CAIXA POSTAL"
  ];

  function extractDispositionFromDescription(desc) {
    if (!desc) return null;
    const raw = String(desc).toUpperCase();
    for (const d of DISPOSITIONS) {
      if (raw.includes(d)) return d;
    }
    return null;
  }

  // =======================
  // Helpers número/tempo (comercial + status)
  // =======================
  function normalizeNumber(raw) {
    if (!raw) return "";
    return String(raw).trim().replace(/[^\d+]/g, "");
  }

  function extractPhoneFromCall(call) {
    const cand =
      call.PHONE_NUMBER ||
      call.CALL_PHONE_NUMBER ||
      call.PHONE ||
      call.CALLER_ID ||
      call.CALL_FROM ||
      call.CALL_TO ||
      call.NUMBER ||
      "";
    return normalizeNumber(cand);
  }

  function extractPhoneFromActivity(act) {
    const comm = act.COMMUNICATIONS;
    if (Array.isArray(comm) && comm.length) {
      const v = comm[0].VALUE || comm[0].VALUE_NORMALIZED || "";
      return normalizeNumber(v);
    }
    return "";
  }

  function callStartTs(call) {
    const dt = call.CALL_START_DATE || call.CALL_START_DATE_FORMATTED || call.CALL_START_DATE_SHORT || null;
    return dt ? new Date(String(dt).replace(" ", "T")).getTime() : 0;
  }

  function activityStartTs(act) {
    const dt = act.START_TIME || null; // "YYYY-MM-DD HH:MM:SS"
    return dt ? new Date(String(dt).replace(" ", "T")).getTime() : 0;
  }

  // Index por (responsável|telefone) => lista de atividades ordenadas por horário
  function indexActivities(activities) {
    const map = new Map();

    (activities || []).forEach(a => {
      const disp = extractDispositionFromDescription(a.DESCRIPTION);
      if (!disp) return;

      const resp = a.RESPONSIBLE_ID ? String(a.RESPONSIBLE_ID) : "0";
      const phone = extractPhoneFromActivity(a);
      if (!phone) return;

      const ts = activityStartTs(a);
      if (!ts) return;

      const key = `${resp}|${phone}`;
      const arr = map.get(key) || [];
      arr.push({ ts, disposition: disp });
      map.set(key, arr);
    });

    for (const [k, arr] of map.entries()) {
      arr.sort((x, y) => x.ts - y.ts);
      map.set(k, arr);
    }

    return map;
  }

  // encontra a atividade mais próxima dentro de uma janela (ex: 10min)
  function matchDispositionForCall(call, actIndex, windowMs) {
    const resp = call.PORTAL_USER_ID ? String(call.PORTAL_USER_ID) : "0";
    const phone = extractPhoneFromCall(call);
    if (!phone) return null;

    const key = `${resp}|${phone}`;
    const arr = actIndex.get(key);
    if (!arr || !arr.length) return null;

    const ts = callStartTs(call);
    if (!ts) return null;

    let best = null;
    let bestDiff = Infinity;

    for (const it of arr) {
      const diff = Math.abs(it.ts - ts);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = it;
      }
    }

    return (best && bestDiff <= windowMs) ? best.disposition : null;
  }

  // =======================
  // Pipeline (Voximplant filters)
  // =======================
  function buildFilterPipeline() {
    return [
      (ctx, base) => CollabFilter.apply(ctx, base),
      (ctx, base) => CallTypeFilter.apply(ctx, base),
      // Period entra por range (chunk)
    ];
  }

  function applyPipeline(ctx, baseFilter, pipeline) {
    let f = baseFilter || {};
    for (const step of pipeline) f = step(ctx, f) || f;
    return f;
  }

  async function tryGetCalls(filterObj, job) {
    return await Provider.getCalls(filterObj, job, { timeoutPerPageMs: 30000, maxTotalMs: 180000 });
  }

  // =======================
  // ✅ ANTI-TIMEOUT DEFINITIVO (split recursivo do range)
  // =======================
  function fmtIso(d) {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    const hh   = String(d.getHours()).padStart(2,'0');
    const mi   = String(d.getMinutes()).padStart(2,'0');
    const ss   = String(d.getSeconds()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  async function fetchRangeSafe(ctx, pipeline, range, job, depth) {
    if (job && job.canceled) throw new Error('CANCELED');
    depth = depth || 0;

    let f = applyPipeline(ctx, {}, pipeline);
    f = PeriodFilter.applyToFilter(ctx, f, range);

    try {
      const part = await tryGetCalls(f, job);
      return part || [];
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e || '');
      if (msg !== 'TIMEOUT') throw e;

      if (depth >= 12) throw e;

      const start = new Date(range.dateFrom).getTime();
      const end   = new Date(range.dateTo).getTime();
      if (!start || !end || start >= end) throw e;

      const mid = Math.floor((start + end) / 2);

      const leftEnd = new Date(mid - 1000);
      const rightStart = new Date(mid + 1000);

      const left = { dateFrom: range.dateFrom, dateTo: fmtIso(leftEnd) };
      const right = { dateFrom: fmtIso(rightStart), dateTo: range.dateTo };

      const a = await fetchRangeSafe(ctx, pipeline, left, job, depth + 1);
      const b = await fetchRangeSafe(ctx, pipeline, right, job, depth + 1);
      return a.concat(b);
    }
  }

  // =======================
  // Cache simples (memória) — 5 min
  // =======================
  const __cache = {
    calls: new Map(),    // key -> {ts, data}
    actIndex: new Map()  // key -> {ts, data}
  };
  const CACHE_TTL_MS = 5 * 60 * 1000;

  function cacheGet(map, key) {
    const hit = map.get(key);
    if (!hit) return null;
    if ((Date.now() - hit.ts) > CACHE_TTL_MS) {
      map.delete(key);
      return null;
    }
    return hit.data;
  }

  function cacheSet(map, key, data) {
    map.set(key, { ts: Date.now(), data });
  }

  function stableKey(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  function normalizeIds(arr) {
    if (!Array.isArray(arr)) return null;
    return arr.map(String).sort();
  }

  // ✅ NOVO: invalidação central do cache (chamado pelo watcher / UI)
  function invalidateCache() {
    __cache.calls.clear();
    __cache.actIndex.clear();
    // (se no futuro tiver mais cache, limpa aqui)
  }

  // =======================
  // Fetch de calls com chunking + anti-timeout
  // =======================
  async function fetchWithChunking(filters, job) {
    const ctx = { filters: filters || {} };
    const pipeline = buildFilterPipeline();
    const ranges = PeriodFilter.buildRanges(ctx);
    if (!ranges.length) return [];

    let allCalls = [];

    for (const r of ranges) {
      if (job && job.canceled) throw new Error('CANCELED');

      try {
        const part = await fetchRangeSafe(ctx, pipeline, r, job, 0);
        allCalls = allCalls.concat(part || []);
        continue;

      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e || '');

        const hasMultiUsers = Array.isArray(filters.collaboratorIds) && filters.collaboratorIds.length > 1;
        if (hasMultiUsers) {
          log('[TelefoniaService] FILTER com array de usuários pode falhar -> fallback por usuário', msg);

          for (const uid of filters.collaboratorIds) {
            if (job && job.canceled) throw new Error('CANCELED');

            const perUserFilters = { ...filters, collaboratorIds: null, collaboratorId: String(uid) };
            const perCtx = { filters: perUserFilters };
            const perPipeline = buildFilterPipeline();

            const partU = await fetchRangeSafe(perCtx, perPipeline, r, job, 0);
            allCalls = allCalls.concat(partU || []);
          }
          continue;
        }

        if ((filters.callType || 'none') === 'inbound') {
          log('[TelefoniaService] inbound array pode falhar -> fallback CALL_TYPE=2 e 3', msg);

          const INCOMING_LOCAL = 2;
          const INCOMING_REDIRECTED_LOCAL = 3;

          for (const t of [INCOMING_LOCAL, INCOMING_REDIRECTED_LOCAL]) {
            if (job && job.canceled) throw new Error('CANCELED');

            const perFilters = { ...filters, callType: 'none' };
            const perCtx = { filters: perFilters };
            const perPipeline = buildFilterPipeline();

            let tf = applyPipeline(perCtx, {}, perPipeline);
            tf = PeriodFilter.applyToFilter(perCtx, tf, r);
            tf["CALL_TYPE"] = t;

            const partT = await tryGetCalls(tf, job);
            allCalls = allCalls.concat(partT || []);
          }
          continue;
        }

        throw e;
      }
    }

    return allCalls;
  }

  // =======================
  // ANÁLISE COMERCIAL (ligações + contatos)
  // =======================
  const OUTGOING = 1;
  const INCOMING = 2;
  const INCOMING_REDIRECTED = 3;

  function safeDurationSec(call) {
    const dur = parseInt(call.CALL_DURATION, 10);
    return Number.isFinite(dur) && dur > 0 ? dur : 0;
  }

  function callBucket(call) {
    const t = parseInt(call.CALL_TYPE, 10) || 0;
    if (t === OUTGOING) return 'outbound';
    if (t === INCOMING || t === INCOMING_REDIRECTED) return 'inbound';
    return 'unknown';
  }

  function buildCommercialAgg(calls) {
    const totals = {
      totalCalls: (calls || []).length,
      inbound: 0,
      outbound: 0,
      unknown: 0,
      answered: 0,
      missed: 0,
      totalDurationSeconds: 0,
      uniqueNumbers: 0
    };

    const byUser = {};
    const globalNums = new Set();

    function ensureUser(userId) {
      if (!byUser[userId]) {
        byUser[userId] = {
          userId,
          totalCalls: 0,
          inbound: 0,
          outbound: 0,
          answered: 0,
          missed: 0,
          totalDurationSeconds: 0,
          uniqueNumbers: 0,
          _nums: new Set()
        };
      }
      return byUser[userId];
    }

    for (const c of (calls || [])) {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const dur = safeDurationSec(c);
      const answered = dur > 0;
      const bucket = callBucket(c);

      totals.totalDurationSeconds += dur;
      if (answered) totals.answered++; else totals.missed++;

      if (bucket === 'inbound') totals.inbound++;
      else if (bucket === 'outbound') totals.outbound++;
      else totals.unknown++;

      const u = ensureUser(userId);
      u.totalCalls++;
      u.totalDurationSeconds += dur;
      if (answered) u.answered++; else u.missed++;

      if (bucket === 'inbound') u.inbound++;
      else if (bucket === 'outbound') u.outbound++;

      const num = extractPhoneFromCall(c);
      if (num) {
        globalNums.add(num);
        u._nums.add(num);
      }
    }

    totals.uniqueNumbers = globalNums.size;

    const rows = Object.values(byUser).map(u => {
      u.uniqueNumbers = u._nums.size;
      delete u._nums;
      return u;
    });

    return { totals, byUser: rows };
  }

  // =======================
  // Status summary helper (fora do objeto, pra evitar erro de sintaxe)
  // =======================
  function buildStatusSummary(callsWithDisp) {
    const counts = new Map();

    for (const d of DISPOSITIONS) counts.set(d, 0);
    counts.set('SEM_STATUS', 0);

    for (const c of (callsWithDisp || [])) {
      const disp = c.__DISPOSITION;
      if (disp && counts.has(disp)) counts.set(disp, (counts.get(disp) || 0) + 1);
      else counts.set('SEM_STATUS', (counts.get('SEM_STATUS') || 0) + 1);
    }

    const out = [];

    for (const d of DISPOSITIONS) {
      const n = counts.get(d) || 0;
      if (n > 0) out.push({ status: d, key: d, count: n });
    }

    const sem = counts.get('SEM_STATUS') || 0;
    if (sem > 0) out.push({ status: 'Sem status', key: 'SEM_STATUS', count: sem });

    return out;
  }

  // =======================
  // ✅ WATCHER (poll leve em background)
  // =======================
  const __watcher = {
    timer: null,
    lastFp: null,
    opts: null,
    running: false
  };

  function makeCallFingerprint(call) {
    if (!call) return null;
    const id  = call.CALL_ID || call.ID || '';
    const dt  = call.CALL_START_DATE || call.CALL_START_DATE_FORMATTED || call.CALL_START_DATE_SHORT || '';
    const uid = call.PORTAL_USER_ID || '';
    const num = call.PHONE_NUMBER || call.CALL_PHONE_NUMBER || call.PHONE || call.CALL_FROM || call.CALL_TO || '';
    const dur = call.CALL_DURATION || '';
    return `${id}|${dt}|${uid}|${num}|${dur}`;
  }

  function buildWatcherFilter(lookbackHours) {
    const to = new Date();
    const from = new Date(Date.now() - (Math.max(1, lookbackHours || 48) * 60 * 60 * 1000));

    // ✅ campos padrão de filtro do Vox implant (usados normalmente no PeriodFilter)
    return {
      CALL_START_DATE_from: fmtIso(from),
      CALL_START_DATE_to: fmtIso(to)
    };
  }

  async function watcherTick() {
    if (!__watcher.running) return;
    if (__watcher.opts && __watcher.opts.skipWhenHidden && document.hidden) return;

    try {
      if (!Provider || typeof Provider.getLatestCall !== 'function') return;

      const lookback = (__watcher.opts && __watcher.opts.lookbackHours) || 48;
      const filter = buildWatcherFilter(lookback);

      const latest = await Provider.getLatestCall(filter, null, { timeoutMs: 15000 });
      const fp = makeCallFingerprint(latest);

      if (!fp) return;

      // primeira execução: apenas seta baseline
      if (!__watcher.lastFp) {
        __watcher.lastFp = fp;
        return;
      }

      // mudou -> tem ligação nova (ou atualização relevante)
      if (fp !== __watcher.lastFp) {
        __watcher.lastFp = fp;

        invalidateCache();
        App.state.telefoniaNeedsRefresh = true;

        // emite evento global (opcional)
        if (App.events && typeof App.events.emit === 'function') {
          App.events.emit('telefonia:calls_updated', { latest });
        }

        log('[TelefoniaService] Nova ligação detectada -> cache invalidado');
      }
    } catch (e) {
      // não quebra o app por causa do watcher
      const msg = (e && e.message) ? e.message : String(e || '');
      if (msg !== 'TIMEOUT') log('[TelefoniaService] watcherTick erro', e);
    }
  }

  function startWatcher(opts) {
    // idempotente
    __watcher.opts = __watcher.opts || {};
    __watcher.opts = { ...__watcher.opts, ...(opts || {}) };

    if (__watcher.timer) return;

    const intervalMs = Math.max(8000, (__watcher.opts.intervalMs || 20000));

    __watcher.running = true;
    __watcher.timer = setInterval(watcherTick, intervalMs);

    // tick inicial (baseline rápido)
    watcherTick().catch(() => {});
  }

  function stopWatcher() {
    __watcher.running = false;
    if (__watcher.timer) {
      clearInterval(__watcher.timer);
      __watcher.timer = null;
    }
  }

  // =======================
  // Service Public API
  // =======================
  const TelefoniaService = {
    // watcher + cache (novos)
    invalidateCache,
    startWatcher,
    stopWatcher,

    getActiveCollaborators(job) {
      return Provider.getActiveCollaborators(job);
    },

    async fetchOverview(filters, job) {
      const calls = await fetchWithChunking(filters, job);
      const agg = Core.aggregateOverview(calls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchChamadasRecebidas(filters, job) {
      const calls = await fetchWithChunking(filters, job);
      const agg = Core.aggregateInbound(calls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchChamadasRealizadas(filters, job) {
      const calls = await fetchWithChunking(filters, job);
      const agg = Core.aggregateOutbound(calls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    // ✅ Otimizado: agora SEMPRE consegue montar statusSummary sem puxar "tudo" do CRM
    async fetchAnaliseComercial(filters, job) {
      const statusFilter = (filters && filters.status) ? filters.status : "all";
      const collabIdsSorted = normalizeIds(filters && filters.collaboratorIds);

      // 1) calls cache
      const callsKey = stableKey({
        dateFrom: filters && filters.dateFrom,
        dateTo: filters && filters.dateTo,
        callType: (filters && filters.callType) ? filters.callType : 'none',
        collaboratorIds: collabIdsSorted
      });

      let calls = cacheGet(__cache.calls, callsKey);
      if (!calls) {
        calls = await fetchWithChunking(filters, job);
        cacheSet(__cache.calls, callsKey, calls);
      }

      const ProviderCRM = App.modules.TelefoniaProviderCRM;
      if (!ProviderCRM || typeof ProviderCRM.getCallActivities !== 'function') {
        throw new Error('Provider CRM não carregado (TelefoniaProviderCRM). Verifique o import no app.html.');
      }

      let respIds = collabIdsSorted;

      if (!Array.isArray(respIds) || respIds.length === 0) {
        const active = await Provider.getActiveCollaborators(job);
        respIds = (active || []).map(u => String(u.ID)).sort();
      }

      const needAllDispositions = (statusFilter === "all" || statusFilter === "SEM_STATUS");

      const actKey = stableKey({
        dateFrom: filters && filters.dateFrom,
        dateTo: filters && filters.dateTo,
        responsibleIds: respIds,
        mode: needAllDispositions ? 'ALL_DISPOSITIONS' : ('ONE:' + statusFilter)
      });

      let actIndex = cacheGet(__cache.actIndex, actKey);

      if (!actIndex) {
        let activities = [];

        if (needAllDispositions) {
          const promises = DISPOSITIONS.map(disp =>
            ProviderCRM.getCallActivities(filters.dateFrom, filters.dateTo, respIds, disp, job)
          );

          const results = await Promise.all(promises);

          const byId = new Map();
          for (const arr of results) {
            for (const a of (arr || [])) byId.set(String(a.ID), a);
          }
          activities = Array.from(byId.values());

        } else {
          activities = await ProviderCRM.getCallActivities(filters.dateFrom, filters.dateTo, respIds, statusFilter, job);
        }

        actIndex = indexActivities(activities);
        cacheSet(__cache.actIndex, actKey, actIndex);
      }

      // 3) join calls x activities
      const WINDOW_MS = 10 * 60 * 1000;

      const callsWithDisp = (calls || []).map(c => {
        const disp = matchDispositionForCall(c, actIndex, WINDOW_MS);
        return { ...c, __DISPOSITION: disp };
      });

      // 4) aplica filtro de status
      let filteredCalls = callsWithDisp;

      if (statusFilter === "SEM_STATUS") {
        filteredCalls = callsWithDisp.filter(c => !c.__DISPOSITION);
      } else if (statusFilter !== "all") {
        filteredCalls = callsWithDisp.filter(c => c.__DISPOSITION === statusFilter);
      }

      // 5) agrega e devolve com statusSummary
      const agg = buildCommercialAgg(filteredCalls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);

      agg.statusSummary = buildStatusSummary(filteredCalls);

      return agg;
    }
  };

  App.modules.TelefoniaService = TelefoniaService;
})(window);