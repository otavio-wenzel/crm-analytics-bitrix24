(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  const Core            = App.modules.TelefoniaCore;
  const PeriodFilter    = App.modules.TelefoniaFilterPeriod;
  const CollabFilter    = App.modules.TelefoniaFilterCollaborator;
  const CallTypeFilter  = App.modules.TelefoniaFilterCallType;

  const Provider = App.modules.TelefoniaProviderVox;

  function buildFilterPipeline() {
    return [
      (ctx, base) => CollabFilter.apply(ctx, base),
      (ctx, base) => CallTypeFilter.apply(ctx, base),
      // Period entra por range (chunk) abaixo
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

      log('[TelefoniaService] CHUNK FILTER', f);

      try {
        const part = await tryGetCalls(f, job);
        allCalls = allCalls.concat(part || []);
        continue;

      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e || '');

        // TIMEOUT => fallback 3 dias
        if (msg === 'TIMEOUT') {
          log('[TelefoniaService] chunk TIMEOUT -> fallback 3 dias', r);
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

        // ✅ Fallback 1: multi-user (collaboratorIds) pode não ser suportado em FILTER
        const hasMultiUsers = Array.isArray(filters.collaboratorIds) && filters.collaboratorIds.length > 1;
        if (hasMultiUsers) {
          log('[TelefoniaService] FILTER com array de usuários pode falhar -> fallback por usuário', msg);

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

        // ✅ Fallback 2: inbound usa CALL_TYPE=[2,3] (array) e pode falhar
        if ((filters.callType || 'none') === 'inbound') {
          log('[TelefoniaService] inbound array pode falhar -> fallback CALL_TYPE=2 e 3', msg);

          const INCOMING = 2;
          const INCOMING_REDIRECTED = 3;

          const twoCalls = [];
          for (const t of [INCOMING, INCOMING_REDIRECTED]) {
            if (job && job.canceled) throw new Error('CANCELED');

            const perFilters = { ...filters, callType: 'none' }; // evita o filtro aplicar array
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

  // ===== ANÁLISE COMERCIAL (ligações + contatos) =====
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

  function normalizeNumber(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    return s.replace(/[^\d+]/g, '');
  }

  function extractPhone(call) {
    const cand =
      call.PHONE_NUMBER ||
      call.CALL_PHONE_NUMBER ||
      call.PHONE ||
      call.CALLER_ID ||
      call.CALL_FROM ||
      call.CALL_TO ||
      call.NUMBER ||
      '';
    return normalizeNumber(cand);
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

      const num = extractPhone(c);
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

  const TelefoniaService = {
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

    async fetchAnaliseComercial(filters, job) {
      const calls = await fetchWithChunking(filters, job);
      const agg = buildCommercialAgg(calls);
      agg.byUser = await Core.enrichWithUserNames(agg.byUser, job);
      return agg;
    }
  };

  App.modules.TelefoniaService = TelefoniaService;
})(window);