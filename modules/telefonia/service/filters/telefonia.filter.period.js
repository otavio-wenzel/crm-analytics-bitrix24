(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  App.modules = App.modules || {};

  function isoToSpace(dt) {
    return (dt && typeof dt === 'string') ? dt.replace('T', ' ') : dt;
  }

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

  function makeChunks(dateFrom, dateTo, chunkDays) {
    const chunks = [];
    let cursorFrom = dateFrom;

    // ✅ importante: não pular nem criar gaps
    while (new Date(cursorFrom) <= new Date(dateTo)) {
      const cursorTo = addDays(cursorFrom, chunkDays);
      const cappedTo = (new Date(cursorTo) > new Date(dateTo)) ? dateTo : cursorTo;
      chunks.push({ dateFrom: cursorFrom, dateTo: cappedTo });
      cursorFrom = addDays(cappedTo, 1); // próximo dia após o cappedTo
    }
    return chunks;
  }

  function buildBasePeriodFilter(ctx, baseFilter, range) {
    if (range && range.dateFrom) baseFilter[">=CALL_START_DATE"] = isoToSpace(range.dateFrom);
    if (range && range.dateTo)   baseFilter["<=CALL_START_DATE"] = isoToSpace(range.dateTo);
    return baseFilter;
  }

  function buildRanges(ctx) {
    const f = ctx.filters || {};
    if (!f.dateFrom || !f.dateTo) return [];

    const from = f.dateFrom;
    const to   = f.dateTo;

    // ranges grandes: chunk 7 dias, fallback interno 3 dias fica no provider/service
    const CHUNK_DAYS = 7;
    const chunks = makeChunks(from, to, CHUNK_DAYS);

    log('[PeriodFilter] chunks = ' + chunks.length, { from, to });
    return chunks;
  }

  App.modules.TelefoniaFilterPeriod = {
    buildRanges,
    applyToFilter: buildBasePeriodFilter
  };
})(window);