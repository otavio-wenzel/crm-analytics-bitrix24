(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  const Core            = App.modules.TelefoniaCore;
  const PeriodFilter    = App.modules.TelefoniaFilterPeriod;
  const CollabFilter    = App.modules.TelefoniaFilterCollaborator;
  const CallTypeFilter  = App.modules.TelefoniaFilterCallType;

  const Provider = App.modules.TelefoniaProviderVox;

  const DISPOSITIONS = [
    "REUNIÃO AGENDADA",
    "FALEI COM SECRETÁRIA",
    "FOLLOW-UP",
    "RETORNO POR E-MAIL",
    "NÃO TEM INTERESSE",
    "NÃO FAZ LOCAÇÃO",
    "CAIXA POSTAL",
    "CHAMADA OCUPADA",
    "DESLIGOU",
    "CHAMADA PERDIDA",
    "NÚMERO INCORRETO"
  ];

  function extractDispositionFromDescription(desc) {
    if (!desc) return null;
    const raw = String(desc).toUpperCase();
    for (const d of DISPOSITIONS) {
      if (raw.includes(d)) return d;
    }
    return null;
  }

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
    const dt = act.START_TIME || null;
    return dt ? new Date(String(dt).replace(" ", "T")).getTime() : 0;
  }

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

  function buildFilterPipeline() {
    return [
      (ctx, base) => CollabFilter.apply(ctx, base),
      (ctx, base) => CallTypeFilter.apply(ctx, base),
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

  function fmtIso(d) {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    const hh   = String(d.getHours()).padStart(2,'0');
    const mi   = String(d.getMinutes()).padStart(2,'0');
    const ss   = String(d.getSeconds()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  // pool simples (concorrência controlada)
  async function runPool(items, concurrency, workerFn, job) {
    const list = Array.isArray(items) ? items : [];
    const n = Math.max(1, parseInt(concurrency, 10) || 1);

    let idx = 0;
    const out = new Array(list.length);

    async function worker() {
      while (true) {
        if (job && job.canceled) throw new Error('CANCELED');

        const i = idx++;
        if (i >= list.length) return;

        out[i] = await workerFn(list[i], i);
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(n, list.length); i++) workers.push(worker());
    await Promise.all(workers);
    return out;
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

      if (depth >= 14) throw e;

      const start = new Date(range.dateFrom).getTime();
      const end   = new Date(range.dateTo).getTime();
      if (!start || !end || start >= end) throw e;

      const mid = Math.floor((start + end) / 2);

      // FIX: sem “buraco” entre ranges
      const leftEnd = new Date(mid);
      const rightStart = new Date(mid + 1000);

      const left = { dateFrom: range.dateFrom, dateTo: fmtIso(leftEnd) };
      const right = { dateFrom: fmtIso(rightStart), dateTo: range.dateTo };

      const a = await fetchRangeSafe(ctx, pipeline, left, job, depth + 1);
      const b = await fetchRangeSafe(ctx, pipeline, right, job, depth + 1);
      return a.concat(b);
    }
  }

  // CACHE (unificado)
  const __cache = {
    calls: new Map(),    // key -> {ts, data, fp}
    actIndex: new Map()  // key -> {ts, data}
  };
  const CACHE_TTL_MS = 5 * 60 * 1000;

  function cacheGetEntry(map, key) {
    const hit = map.get(key);
    if (!hit) return null;
    if ((Date.now() - hit.ts) > CACHE_TTL_MS) {
      map.delete(key);
      return null;
    }
    return hit;
  }

  function cacheGet(map, key) {
    const hit = cacheGetEntry(map, key);
    return hit ? hit.data : null;
  }

  function cacheSet(map, key, data, extra) {
    map.set(key, { ts: Date.now(), data, ...(extra || {}) });
  }

  function stableKey(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  function normalizeIds(arr) {
    if (!Array.isArray(arr)) return null;
    return arr.map(String).sort();
  }

  function invalidateCache() {
    __cache.calls.clear();
    __cache.actIndex.clear();
  }

  // Calls cache + revalidação leve
  function makeCallFingerprint(call) {
    if (!call) return null;
    const id  = call.CALL_ID || call.ID || '';
    const dt  = call.CALL_START_DATE || call.CALL_START_DATE_FORMATTED || call.CALL_START_DATE_SHORT || '';
    const uid = call.PORTAL_USER_ID || '';
    const num = call.PHONE_NUMBER || call.CALL_PHONE_NUMBER || call.PHONE || call.CALL_FROM || call.CALL_TO || '';
    const dur = call.CALL_DURATION || '';
    return `${id}|${dt}|${uid}|${num}|${dur}`;
  }

  function findLatestCall(calls) {
    let best = null;
    let bestTs = 0;
    for (const c of (calls || [])) {
      const ts = callStartTs(c);
      if (ts > bestTs) {
        bestTs = ts;
        best = c;
      }
    }
    return best;
  }

  function rangeIncludesNow(filters) {
    const toTs = new Date(filters.dateTo).getTime();
    if (!toTs) return false;
    return toTs >= (Date.now() - 2 * 60 * 1000);
  }

  async function getLatestCallForFilters(filters, job) {
    if (!Provider || typeof Provider.getLatestCall !== 'function') return null;

    const ctx = { filters: filters || {} };
    const pipeline = buildFilterPipeline();

    let f = applyPipeline(ctx, {}, pipeline);
    f = PeriodFilter.applyToFilter(ctx, f, { dateFrom: filters.dateFrom, dateTo: filters.dateTo });

    return await Provider.getLatestCall(f, job, { timeoutMs: 15000 });
  }

  function callsCacheKeyFromFilters(filters) {
    const collabIdsSorted = normalizeIds(filters && filters.collaboratorIds);

    return stableKey({
      dateFrom: filters && filters.dateFrom,
      dateTo: filters && filters.dateTo,

      // multi/single
      collaboratorIds: collabIdsSorted,
      collaboratorId: (filters && filters.collaboratorId) ? String(filters.collaboratorId) : null,

      // callType (comercial usa; outros geralmente não)
      callType: (filters && filters.callType) ? String(filters.callType) : 'none'
    });
  }

  async function fetchCallsCached(filters, job) {
    const key = callsCacheKeyFromFilters(filters);
    let entry = cacheGetEntry(__cache.calls, key);
    let calls = entry ? entry.data : null;

    const isUserRefresh = !!(filters && filters.__userRefresh);

    // revalidação leve (só quando user pediu refresh e range inclui "agora")
    if (calls && entry && isUserRefresh && rangeIncludesNow(filters)) {
      try {
        const latest = await getLatestCallForFilters(filters, job);
        const fpNow = makeCallFingerprint(latest);
        const fpWas = entry.fp;

        if (fpNow && fpWas && fpNow !== fpWas) {
          log('[TelefoniaService] detectou ligação nova -> invalidando cache.calls e actIndex');
          __cache.calls.delete(key);
          __cache.actIndex.clear();
          calls = null;
          entry = null;
        }
      } catch (e) {
        // falhou check leve -> não derruba
      }
    }

    if (!calls) {
      calls = await fetchWithChunking(filters, job);

      const latest = findLatestCall(calls);
      const fp = makeCallFingerprint(latest);
      cacheSet(__cache.calls, key, calls, { fp });
    }

    return calls || [];
  }

  // FETCH com chunking + concorrência controlada
  async function fetchWithChunking(filters, job) {
    const ctx = { filters: filters || {} };
    const pipeline = buildFilterPipeline();
    const ranges = PeriodFilter.buildRanges(ctx);
    if (!ranges.length) return [];

    // concorrência do Voximplant: mantenha baixa para evitar rate-limit/engasgo. Pode ser ajustado: 1, 2, 3
    const VOX_CONCURRENCY = (ranges.length >= 20) ? 2 : 3;

    async function fetchOneRange(r) {
      if (job && job.canceled) throw new Error('CANCELED');

      try {
        return await fetchRangeSafe(ctx, pipeline, r, job, 0);

      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e || '');

        const hasMultiUsers = Array.isArray(filters.collaboratorIds) && filters.collaboratorIds.length > 1;
        if (hasMultiUsers) {
          log('[TelefoniaService] FILTER com array de usuários pode falhar -> fallback por usuário', msg);

          const perUserIds = filters.collaboratorIds.map(String);

          const perUserResults = await runPool(perUserIds, 2, async (uid) => {
            if (job && job.canceled) throw new Error('CANCELED');

            const perUserFilters = { ...filters, collaboratorIds: null, collaboratorId: String(uid) };
            const perCtx = { filters: perUserFilters };
            const perPipeline = buildFilterPipeline();

            return await fetchRangeSafe(perCtx, perPipeline, r, job, 0);
          }, job);

          return perUserResults.flat().filter(Boolean);
        }

        if ((filters.callType || 'none') === 'inbound') {
          log('[TelefoniaService] inbound array pode falhar -> fallback CALL_TYPE=2 e 3', msg);

          const INCOMING_LOCAL = 2;
          const INCOMING_REDIRECTED_LOCAL = 3;

          const results = await runPool([INCOMING_LOCAL, INCOMING_REDIRECTED_LOCAL], 1, async (t) => {
            if (job && job.canceled) throw new Error('CANCELED');

            const perFilters = { ...filters, callType: 'none' };
            const perCtx = { filters: perFilters };
            const perPipeline = buildFilterPipeline();

            let tf = applyPipeline(perCtx, {}, perPipeline);
            tf = PeriodFilter.applyToFilter(perCtx, tf, r);
            tf["CALL_TYPE"] = t;

            return await tryGetCalls(tf, job);
          }, job);

          return results.flat().filter(Boolean);
        }

        throw e;
      }
    }

    const parts = await runPool(ranges, VOX_CONCURRENCY, fetchOneRange, job);
    return parts.flat().filter(Boolean);
  }

  // Comercial aggregations
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

  // API pública do Service
  const TelefoniaService = {
    invalidateCache,

    getActiveCollaborators(job) {
      return Provider.getActiveCollaborators(job);
    },

    // agora todos os views reaproveitam o mesmo cache de calls
    async fetchOverview(filters, job) {
      const calls = await fetchCallsCached(filters, job);
      const agg = Core.aggregateOverview(calls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchChamadasRecebidas(filters, job) {
      const calls = await fetchCallsCached(filters, job);
      const agg = Core.aggregateInbound(calls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchChamadasRealizadas(filters, job) {
      const calls = await fetchCallsCached(filters, job);
      const agg = Core.aggregateOutbound(calls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchAnaliseComercial(filters, job) {
      const statusFilter = (filters && filters.status) ? filters.status : "all";
      const collabIdsSorted = normalizeIds(filters && filters.collaboratorIds);

      // garante que o cache de calls para comercial NÃO varie por status
      const callsFilters = {
        ...filters,
        collaboratorIds: collabIdsSorted
      };

      const calls = await fetchCallsCached(callsFilters, job);

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
          const CRM_CONCURRENCY = 2;

          const results = await runPool(DISPOSITIONS, CRM_CONCURRENCY, async (disp) => {
            if (job && job.canceled) throw new Error('CANCELED');
            return await ProviderCRM.getCallActivities(filters.dateFrom, filters.dateTo, respIds, disp, job);
          }, job);

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

      const WINDOW_MS = 10 * 60 * 1000;

      const callsWithDisp = (calls || []).map(c => {
        const disp = matchDispositionForCall(c, actIndex, WINDOW_MS);
        return { ...c, __DISPOSITION: disp };
      });

      let filteredCalls = callsWithDisp;

      if (statusFilter === "SEM_STATUS") {
        filteredCalls = callsWithDisp.filter(c => !c.__DISPOSITION);
      } else if (statusFilter !== "all") {
        filteredCalls = callsWithDisp.filter(c => c.__DISPOSITION === statusFilter);
      }

      const agg = buildCommercialAgg(filteredCalls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      agg.statusSummary = buildStatusSummary(filteredCalls);

      return agg;
    }
  };

  App.modules.TelefoniaService = TelefoniaService;
})(window);