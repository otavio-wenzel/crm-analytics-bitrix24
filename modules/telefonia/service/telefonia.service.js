(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  const Core = App.modules.TelefoniaCore;
  const PeriodFilter = App.modules.TelefoniaFilterPeriod;
  const CollabFilter = App.modules.TelefoniaFilterCollaborator;

  // Strategy: provider atual (Voximplant)
  const Provider = App.modules.TelefoniaProviderVox;

  function buildFilterPipeline() {
    return [
      (ctx, base) => CollabFilter.apply(ctx, base),
      // Period é aplicado por range (chunk) mais abaixo
    ];
  }

  function applyPipeline(ctx, baseFilter, pipeline) {
    let f = baseFilter;
    for (const step of pipeline) f = step(ctx, f) || f;
    return f;
  }

  async function fetchWithChunking(filters, job) {
    const ctx = { filters };
    const pipeline = buildFilterPipeline();

    const ranges = PeriodFilter.buildRanges(ctx);

    // não deve acontecer (removemos all), mas se acontecer: não buscar infinito
    if (!ranges.length) return [];

    let allCalls = [];

    for (const r of ranges) {
      if (job && job.canceled) throw new Error('CANCELED');

      // base filter do chunk
      let f = applyPipeline(ctx, {}, pipeline);
      f = PeriodFilter.applyToFilter(ctx, f, r);

      log('[TelefoniaService] CHUNK FILTER', f);

      try {
        const part = await Provider.getCalls(f, job, { timeoutPerPageMs: 30000, maxTotalMs: 180000 });
        allCalls = allCalls.concat(part || []);
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e || '');
        if (msg === 'TIMEOUT') {
          // ✅ fallback: subdivide chunk em 3 dias usando o PeriodFilter (sem duplicar lógica aqui)
          log('[TelefoniaService] chunk TIMEOUT -> fallback 3 dias', r);

          // precisa existir no telefonia.filter.period.js:
          // PeriodFilter.splitRange(range, daysPerChunk)
          const subRanges = PeriodFilter.splitRange(r, 3);

          for (const sr of subRanges) {
            if (job && job.canceled) throw new Error('CANCELED');

            let sf = applyPipeline(ctx, {}, pipeline);
            sf = PeriodFilter.applyToFilter(ctx, sf, sr);

            const part2 = await Provider.getCalls(sf, job, { timeoutPerPageMs: 30000, maxTotalMs: 180000 });
            allCalls = allCalls.concat(part2 || []);
          }
        } else {
          throw e;
        }
      }
    }

    return allCalls;
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
    }
  };

  App.modules.TelefoniaService = TelefoniaService;
})(window);