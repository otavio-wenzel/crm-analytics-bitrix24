(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  const Core           = App.modules.TelefoniaCore;
  const PeriodFilter   = App.modules.TelefoniaFilterPeriod;
  const CollabFilter   = App.modules.TelefoniaFilterCollaborator;
  const CallTypeFilter = App.modules.TelefoniaFilterCallType;
  const Provider       = App.modules.TelefoniaProviderVox;

  const QUALIFIED_STATUSES = [
    "IMOBILIARIA QUALIFICADA",
    "EMPRESA QUALIFICADA"
  ];

  /* ============================================================
     HELPERS
  ============================================================ */

  function normalizeIds(arr) {
    if (!Array.isArray(arr)) return null;
    return arr.map(String).sort();
  }

  function stableKey(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
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

  function callStartTs(call) {
    const dt = call.CALL_START_DATE || call.CALL_START_DATE_FORMATTED;
    return dt ? new Date(String(dt).replace(" ", "T")).getTime() : 0;
  }

  function extractDispositionFromDescription(desc) {
    if (!desc) return null;

    const raw = String(desc).toUpperCase().trim();

    for (const status of QUALIFIED_STATUSES) {
      if (raw.includes(status)) {
        return status;
      }
    }

    return null;
  }

  /* ============================================================
     CACHE
  ============================================================ */

  const __cache = {
    calls: new Map(),
    actIndex: new Map()
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

  function invalidateCache() {
    __cache.calls.clear();
    __cache.actIndex.clear();
  }

  /* ============================================================
     FILTER PIPELINE
  ============================================================ */

  function buildFilterPipeline() {
    return [
      (ctx, base) => CollabFilter.apply(ctx, base),
      (ctx, base) => CallTypeFilter.apply(ctx, base)
    ];
  }

  function applyPipeline(ctx, baseFilter, pipeline) {
    let f = baseFilter || {};
    for (const step of pipeline) f = step(ctx, f) || f;
    return f;
  }

  async function tryGetCalls(filterObj, job) {
    return Provider.getCalls(filterObj, job, {
      timeoutPerPageMs: 30000,
      maxTotalMs: 180000
    });
  }

  /* ============================================================
     FETCH CALLS (CORRIGIDO)
  ============================================================ */

  async function fetchCallsCached(filters, job) {

    const ctx = { filters: filters || {} };
    const pipeline = buildFilterPipeline();
    const ranges = PeriodFilter.buildRanges(ctx);

    if (!ranges || !ranges.length) return [];

    const cacheKey = stableKey({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      collaboratorIds: normalizeIds(filters.collaboratorIds),
      callType: filters.callType || 'none'
    });

    const cached = cacheGet(__cache.calls, cacheKey);
    if (cached) return cached;

    let all = [];

    for (const range of ranges) {

      if (job && job.canceled) throw new Error('CANCELED');

      let f = applyPipeline(ctx, {}, pipeline);
      f = PeriodFilter.applyToFilter(ctx, f, range);

      const part = await tryGetCalls(f, job);

      if (Array.isArray(part) && part.length) {
        all.push(...part);
      }
    }

    cacheSet(__cache.calls, cacheKey, all);
    return all;
  }

  /* ============================================================
     DISPOSITION MATCH
  ============================================================ */

  function indexActivities(activities) {
    const map = new Map();

    (activities || []).forEach(a => {
      const disp = extractDispositionFromDescription(a.DESCRIPTION);
      if (!disp) return;

      const resp = String(a.RESPONSIBLE_ID || "0");
      const phone = normalizeNumber(
        a.COMMUNICATIONS?.[0]?.VALUE ||
        a.COMMUNICATIONS?.[0]?.VALUE_NORMALIZED || ""
      );

      const ts = a.START_TIME
        ? new Date(String(a.START_TIME).replace(" ", "T")).getTime()
        : 0;

      if (!phone || !ts) return;

      const key = `${resp}|${phone}`;
      const arr = map.get(key) || [];
      arr.push({ ts, disposition: disp });
      map.set(key, arr);
    });

    return map;
  }

  function matchDispositionForCall(call, actIndex, windowMs) {

    const resp = String(call.PORTAL_USER_ID || "0");
    const phone = extractPhoneFromCall(call);
    if (!phone) return null;

    const key = `${resp}|${phone}`;
    const arr = actIndex.get(key);
    if (!arr || !arr.length) return null;

    const ts = callStartTs(call);
    if (!ts) return null;

    let best = null;
    let bestDiff = Infinity;
    let bestIndex = -1;

    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      const diff = Math.abs(it.ts - ts);

      if (diff <= windowMs && diff < bestDiff) {
        best = it;
        bestDiff = diff;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      arr.splice(bestIndex, 1); // remove activity usada
      return best.disposition;
    }

    return null;
  }

  /* ============================================================
     AGGREGATION
  ============================================================ */

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
      totalCalls: calls.length,
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

    for (const c of calls) {
      const userId = String(c.PORTAL_USER_ID || '0');
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

  function buildStatusSummary(calls) {

    const counts = {
      "IMOBILIARIA QUALIFICADA": 0,
      "EMPRESA QUALIFICADA": 0,
      "SEM_STATUS": 0
    };

    for (const c of calls) {
      if (!c.__DISPOSITION) {
        counts.SEM_STATUS++;
      } else {
        counts[c.__DISPOSITION] = (counts[c.__DISPOSITION] || 0) + 1;
      }
    }

    const out = [];

    for (const key of Object.keys(counts)) {
      if (counts[key] > 0) {
        out.push({
          status: key === "SEM_STATUS" ? "Sem status" : key,
          key,
          count: counts[key]
        });
      }
    }

    return out;
  }

  /* ============================================================
     PUBLIC SERVICE
  ============================================================ */

  const TelefoniaService = {

    invalidateCache,

    getActiveCollaborators(job) {
      return Provider.getActiveCollaborators(job);
    },

    async fetchAnaliseComercial(filters, job) {

      const statusFilter = filters?.status || "all";
      const collabIdsSorted = normalizeIds(filters?.collaboratorIds);

      const calls = await fetchCallsCached({
        ...filters,
        collaboratorIds: collabIdsSorted
      }, job);

      const ProviderCRM = App.modules.TelefoniaProviderCRM;

      let respIds = collabIdsSorted;
      if (!respIds || !respIds.length) {
        const active = await Provider.getActiveCollaborators(job);
        respIds = (active || []).map(u => String(u.ID));
      }

      const actKey = stableKey({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        responsibleIds: respIds
      });

      let actIndex = cacheGet(__cache.actIndex, actKey);

      if (!actIndex) {
        const activities = await ProviderCRM.getCallActivities(
          filters.dateFrom,
          filters.dateTo,
          respIds,
          null,
          job
        );
        actIndex = indexActivities(activities);
        cacheSet(__cache.actIndex, actKey, actIndex);
      }

      const WINDOW_MS = 5 * 60 * 1000;

      const callsWithDisp = calls.map(c => ({
        ...c,
        __DISPOSITION: matchDispositionForCall(c, actIndex, WINDOW_MS)
      }));

      let filteredCalls = callsWithDisp;

      if (statusFilter === "SEM_STATUS") {
        filteredCalls = callsWithDisp.filter(c => !c.__DISPOSITION);
      }
      else if (statusFilter !== "all") {
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