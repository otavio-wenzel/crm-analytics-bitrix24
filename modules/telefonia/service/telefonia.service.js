(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  const Core        = App.modules.TelefoniaCore;
  const PeriodFilter= App.modules.TelefoniaFilterPeriod;
  const CollabFilter= App.modules.TelefoniaFilterCollaborator;
  const CallTypeFilter = App.modules.TelefoniaFilterCallType;

  const Provider = App.modules.TelefoniaProviderVox;

  function buildFilterPipeline() {
    return [
      (ctx, base) => CollabFilter.apply(ctx, base),
      (ctx, base) => CallTypeFilter.apply(ctx, base),
      // Period é aplicado por range (chunk) abaixo
    ];
  }

  function applyPipeline(ctx, baseFilter, pipeline) {
    let f = baseFilter;
    for (const step of pipeline) f = step(ctx, f) || f;
    return f;
  }

  // tenta 1 chamada com filtro "array", se der erro, o caller decide fallback
  async function tryGetCalls(filterObj, job) {
    return await Provider.getCalls(filterObj, job, { timeoutPerPageMs: 30000, maxTotalMs: 180000 });
  }

  async function fetchWithChunking(filters, job) {
    const ctx = { filters };
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

      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e || '');

        // timeout => fallback 3 dias (já existia)
        if (msg === 'TIMEOUT') {
          log('[TelefoniaService] chunk TIMEOUT -> fallback 3 dias', r);

          const subRanges = (function splitDays(dateFrom, dateTo, days) {
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
          })(r.dateFrom, r.dateTo, 3);

          for (const sr of subRanges) {
            if (job && job.canceled) throw new Error('CANCELED');
            let sf = applyPipeline(ctx, {}, pipeline);
            sf = PeriodFilter.applyToFilter(ctx, sf, sr);
            const part2 = await tryGetCalls(sf, job);
            allCalls = allCalls.concat(part2 || []);
          }

          continue;
        }

        // fallback: se deu erro por FILTER com array (PORTAL_USER_ID ou CALL_TYPE),
        // e temos múltiplos usuários selecionados, faz chamadas 1-a-1 e junta.
        const hasMultiUsers = Array.isArray(filters.collaboratorIds) && filters.collaboratorIds.length > 1;

        if (hasMultiUsers) {
          log('[TelefoniaService] filtro array pode não ser suportado -> fallback por usuário', msg);

          // remove PORTAL_USER_ID array do filtro base e executa por usuário
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
              if (msg2 === 'TIMEOUT') throw e2; // mantém comportamento padrão
              // outros erros: registra e continua
              log('[TelefoniaService] erro fallback por usuário uid=' + uid, msg2);
            }
          }

          continue;
        }

        throw e;
      }
    }

    return allCalls;
  }

  // ===== ANÁLISE COMERCIAL (agregação própria) =====
  function normalizeNumber(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    const digits = s.replace(/[^\d+]/g, '');
    return digits;
  }

  function extractPhone(call) {
    // tenta campos comuns
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
      uniqueNumbers: 0,
      answered: 0,
      missed: 0,
      totalDurationSeconds: 0
    };

    const byUser = {};
    const globalNumbers = new Set();
    const numbersAgg = new Map(); // number -> {count, totalDurationSeconds}

    function safeDur(c) {
      const dur = parseInt(c.CALL_DURATION, 10);
      return Number.isFinite(dur) && dur > 0 ? dur : 0;
    }

    calls.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const dur = safeDur(c);
      const answered = dur > 0;

      totals.totalDurationSeconds += dur;
      if (answered) totals.answered++; else totals.missed++;

      // user bucket
      if (!byUser[userId]) {
        byUser[userId] = {
          userId,
          totalCalls: 0,
          uniqueNumbers: 0,
          answered: 0,
          missed: 0,
          totalDurationSeconds: 0,
          _nums: new Set()
        };
      }
      const u = byUser[userId];
      u.totalCalls++;
      u.totalDurationSeconds += dur;
      if (answered) u.answered++; else u.missed++;

      const num = extractPhone(c);
      if (num) {
        globalNumbers.add(num);
        u._nums.add(num);

        const cur = numbersAgg.get(num) || { number: num, count: 0, totalDurationSeconds: 0 };
        cur.count++;
        cur.totalDurationSeconds += dur;
        numbersAgg.set(num, cur);
      }
    });

    totals.uniqueNumbers = globalNumbers.size;

    const rows = Object.values(byUser).map(u => {
      const uniqueNumbers = u._nums.size;
      delete u._nums;
      return { ...u, uniqueNumbers };
    });

    const topNumbers = Array.from(numbersAgg.values())
      .sort((a,b) => (b.count - a.count) || (b.totalDurationSeconds - a.totalDurationSeconds))
      .slice(0, 30);

    return { totals, byUser: rows, topNumbers };
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