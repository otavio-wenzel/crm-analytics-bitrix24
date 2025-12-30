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
  const SEM_STATUS = "SEM_STATUS";

  function extractDispositionFromDescription(desc) {
    if (!desc) return null;
    const raw = String(desc).toUpperCase();
    for (const d of DISPOSITIONS) {
      if (raw.includes(d)) return d;
    }
    return null;
  }

  // =======================
  // Helpers de número/tempo
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

  function splitDays(dateFrom, dateTo, days) {
    const out = [];
    function addDays(iso, dds) {
      const d = new Date(iso);
      d.setDate(d.getDate() + dds);
      const yyyy = d.getFullYear();
      const mm   = String(d.getMonth() + 1).padStart(2,'0');
      const dd   = String(d.getDate()).padStart(2,'0');
      const hh   = String(d.getHours()).padStart(2,'0');
      const mi   = String(d.getMinutes()).padStart(2,'0');
      const ss   = String(d.getSeconds()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }
    let cursor = dateFrom;
    while (new Date(cursor) <= new Date(dateTo)) {
      const toN = addDays(cursor, days);
      const capped = (new Date(toN) > new Date(dateTo)) ? dateTo : toN;
      out.push({ dateFrom: cursor, dateTo: capped });
      cursor = addDays(capped, 1);
    }
    return out;
  }

  async function fetchWithChunking(filters, job) {
    const ctx = { filters: filters || {} };
    const pipeline = buildFilterPipeline();
    const ranges = PeriodFilter.buildRanges(ctx);
    if (!ranges.length) return [];

    let allCalls = [];

    for (const r of ranges) {
      if (job && job.canceled) throw new Error('CANCELED');

      let f = applyPipeline(ctx, {}, pipeline);
      f = PeriodFilter.applyToFilter(ctx, f, r);

      try {
        const part = await tryGetCalls(f, job);
        allCalls = allCalls.concat(part || []);
        continue;

      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e || '');

        // TIMEOUT => fallback 3 dias
        if (msg === 'TIMEOUT') {
          const subRanges = splitDays(r.dateFrom, r.dateTo, 3);

          for (const sr of subRanges) {
            if (job && job.canceled) throw new Error('CANCELED');

            let sf = applyPipeline(ctx, {}, pipeline);
            sf = PeriodFilter.applyToFilter(ctx, sf, sr);

            const part2 = await tryGetCalls(sf, job);
            allCalls = allCalls.concat(part2 || []);
          }
          continue;
        }

        // Fallback: multi-user array pode falhar no FILTER
        const hasMultiUsers = Array.isArray(filters.collaboratorIds) && filters.collaboratorIds.length > 1;
        if (hasMultiUsers) {
          for (const uid of filters.collaboratorIds) {
            if (job && job.canceled) throw new Error('CANCELED');

            const perUserFilters = { ...filters, collaboratorIds: null, collaboratorId: String(uid) };
            const perCtx = { filters: perUserFilters };
            const perPipeline = buildFilterPipeline();

            let uf = applyPipeline(perCtx, {}, perPipeline);
            uf = PeriodFilter.applyToFilter(perCtx, uf, r);

            try {
              const partU = await tryGetCalls(uf, job);
              allCalls = allCalls.concat(partU || []);
            } catch (e2) {
              const msg2 = (e2 && e2.message) ? e2.message : String(e2 || '');
              if (msg2 === 'TIMEOUT') throw e2;
              log('[TelefoniaService] erro fallback por usuário uid=' + uid, msg2);
            }
          }
          continue;
        }

        // Fallback inbound array pode falhar
        if ((filters.callType || 'none') === 'inbound') {
          const INCOMING = 2;
          const INCOMING_REDIRECTED = 3;

          const twoCalls = [];
          for (const t of [INCOMING, INCOMING_REDIRECTED]) {
            if (job && job.canceled) throw new Error('CANCELED');

            const perFilters = { ...filters, callType: 'none' };
            const perCtx = { filters: perFilters };
            const perPipeline = buildFilterPipeline();

            let tf = applyPipeline(perCtx, {}, perPipeline);
            tf = PeriodFilter.applyToFilter(perCtx, tf, r);
            tf["CALL_TYPE"] = t;

            const partT = await tryGetCalls(tf, job);
            twoCalls.push(...(partT || []));
          }

          allCalls = allCalls.concat(twoCalls);
          continue;
        }

        throw e;
      }
    }

    return allCalls;
  }

  // =======================
  // ✅ Cache de colaboradores (para NÃO pesar e evitar timeout)
  // =======================
  const COLLAB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
  App.state = App.state || {};
  App.state.telefoniaCollabCache = App.state.telefoniaCollabCache || {
    ts: 0,
    users: null,
    inflight: null
  };

  async function getActiveCollaboratorsCached(job) {
    const cache = App.state.telefoniaCollabCache;
    const now = Date.now();

    if (cache.users && (now - cache.ts) < COLLAB_CACHE_TTL_MS) return cache.users;

    if (cache.inflight) return await cache.inflight;

    cache.inflight = (async () => {
      const users = await Provider.getActiveCollaborators(job);
      cache.users = users || [];
      cache.ts = Date.now();
      cache.inflight = null;
      return cache.users;
    })();

    return await cache.inflight;
  }

  // =======================
  // ✅ Garantir linhas zeradas (aplica em TODOS os módulos)
  // =======================
  function ensureZeroRows(byUserArray, userIdsWanted, templateRowFactory) {
    const arr = Array.isArray(byUserArray) ? byUserArray : [];
    const map = new Map();

    for (const r of arr) {
      const id = (r && (r.userId ?? r.USER_ID ?? r.ID)) != null ? String(r.userId ?? r.USER_ID ?? r.ID) : null;
      if (id) map.set(id, r);
    }

    const out = [...arr];

    for (const uid of (userIdsWanted || [])) {
      const id = String(uid);
      if (!map.has(id)) {
        const zr = templateRowFactory(id);
        out.push(zr);
        map.set(id, zr);
      }
    }

    // mantém ordem: alfabética por nome depois do enrich (ou por ID antes)
    return out;
  }

  function tplOverview(userId) {
    return {
      userId: String(userId),
      totalCalls: 0,
      inbound: 0,
      outbound: 0,
      answered: 0,
      missed: 0,
      totalDurationSeconds: 0
    };
  }

  function tplInbound(userId) {
    return {
      userId: String(userId),
      totalCalls: 0,
      answered: 0,
      missed: 0,
      totalDurationSeconds: 0
    };
  }

  function tplOutbound(userId) {
    return {
      userId: String(userId),
      totalCalls: 0,
      answered: 0,
      missed: 0,
      totalDurationSeconds: 0
    };
  }

  function tplCommercial(userId) {
    return {
      userId: String(userId),
      totalCalls: 0,
      inbound: 0,
      outbound: 0,
      answered: 0,
      missed: 0,
      totalDurationSeconds: 0,
      uniqueNumbers: 0
    };
  }

  async function resolveUserIdsForStandard(filters, job) {
    const collabId = (filters && filters.collaboratorId) ? String(filters.collaboratorId) : 'all';
    if (collabId && collabId !== 'all') return [collabId];

    const users = await getActiveCollaboratorsCached(job);
    return (users || []).map(u => String(u.ID));
  }

  async function resolveUserIdsForCommercial(filters, job) {
    // se o filtro do comercial tem lista -> usa ela (mostra somente esses, inclusive zerados)
    if (Array.isArray(filters.collaboratorIds) && filters.collaboratorIds.length) {
      return filters.collaboratorIds.map(String);
    }
    // senão, é "Todos" -> lista total
    const users = await getActiveCollaboratorsCached(job);
    return (users || []).map(u => String(u.ID));
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

  function buildStatusSummary(callsWithDisp, statusFilter) {
    // sempre retorna linhas estáveis (inclui zeros quando status=all)
    const keysAll = [...DISPOSITIONS, SEM_STATUS];
    const counts = {};
    keysAll.forEach(k => counts[k] = 0);

    for (const c of (callsWithDisp || [])) {
      const k = c.__DISPOSITION ? c.__DISPOSITION : SEM_STATUS;
      if (counts[k] == null) counts[k] = 0;
      counts[k]++;
    }

    function labelOf(k) {
      return k === SEM_STATUS ? 'Sem status' : k;
    }

    if (!statusFilter || statusFilter === 'all') {
      return keysAll.map(k => ({ status: labelOf(k), key: k, count: counts[k] || 0 }));
    }

    // status específico (inclui SEM_STATUS)
    const k = statusFilter;
    const row = { status: labelOf(k), key: k, count: counts[k] || 0 };
    return [row];
  }

  // =======================
  // Service Public API
  // =======================
  const TelefoniaService = {
    getActiveCollaborators(job) {
      return Provider.getActiveCollaborators(job);
    },

    async fetchOverview(filters, job) {
      const calls = await fetchWithChunking(filters, job);
      const agg = Core.aggregateOverview(calls);

      // ✅ garante colaboradores zerados
      const wanted = await resolveUserIdsForStandard(filters, job);
      agg.byUser = ensureZeroRows(agg.byUser, wanted, tplOverview);

      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchChamadasRecebidas(filters, job) {
      const calls = await fetchWithChunking(filters, job);
      const agg = Core.aggregateInbound(calls);

      // ✅ garante colaboradores zerados
      const wanted = await resolveUserIdsForStandard(filters, job);
      agg.byUser = ensureZeroRows(agg.byUser, wanted, tplInbound);

      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchChamadasRealizadas(filters, job) {
      const calls = await fetchWithChunking(filters, job);
      const agg = Core.aggregateOutbound(calls);

      // ✅ garante colaboradores zerados
      const wanted = await resolveUserIdsForStandard(filters, job);
      agg.byUser = ensureZeroRows(agg.byUser, wanted, tplOutbound);

      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    },

    async fetchAnaliseComercial(filters, job) {
      const calls = await fetchWithChunking(filters, job);

      const statusFilter = (filters && filters.status) ? filters.status : "all";

      const ProviderCRM = App.modules.TelefoniaProviderCRM;
      if (!ProviderCRM || typeof ProviderCRM.getCallActivities !== 'function') {
        throw new Error('Provider CRM não carregado (TelefoniaProviderCRM). Verifique o import no app.html.');
      }

      const respIds = Array.isArray(filters.collaboratorIds) ? filters.collaboratorIds : null;

      // join com CRM (disposition)
      const activities = await ProviderCRM.getCallActivities(filters.dateFrom, filters.dateTo, respIds, job);
      const actIndex = indexActivities(activities);

      const WINDOW_MS = 10 * 60 * 1000;

      const callsWithDisp = (calls || []).map(c => {
        const disp = matchDispositionForCall(c, actIndex, WINDOW_MS);
        return { ...c, __DISPOSITION: disp };
      });

      // filtra por status
      let filteredCalls = callsWithDisp;

      if (statusFilter !== "all") {
        if (statusFilter === SEM_STATUS) {
          filteredCalls = callsWithDisp.filter(c => !c.__DISPOSITION);
        } else {
          filteredCalls = callsWithDisp.filter(c => c.__DISPOSITION === statusFilter);
        }
      }

      // agrega
      const agg = buildCommercialAgg(filteredCalls);

      // ✅ resumo de status (pra 2ª tabela)
      // - se status=all, retorna todos (inclui zeros)
      // - se status=específico, retorna só aquele
      agg.statusSummary = buildStatusSummary(
        (statusFilter === "all" ? callsWithDisp : filteredCalls),
        statusFilter
      );

      // ✅ garante colaboradores zerados (respeita seleção do comercial)
      const wanted = await resolveUserIdsForCommercial(filters, job);
      agg.byUser = ensureZeroRows(agg.byUser, wanted, tplCommercial);

      // nomes
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);

      return agg;
    }
  };

  App.modules.TelefoniaService = TelefoniaService;
})(window);