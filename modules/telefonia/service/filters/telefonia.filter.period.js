//telefonia.filter.period.js
(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  App.modules = App.modules || {};

  function isoToSpace(dt) {
    return (dt && typeof dt === 'string') ? dt.replace('T', ' ') : dt;
  }

  function toIsoLocal(d) {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    const hh   = String(d.getHours()).padStart(2,'0');
    const mi   = String(d.getMinutes()).padStart(2,'0');
    const ss   = String(d.getSeconds()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  // ✅ chunks por "dias inteiros" (00:00:00 -> 23:59:59) sem buracos
  function makeDayChunks(dateFromIso, dateToIso, daysPerChunk) {
    const out = [];
    if (!dateFromIso || !dateToIso) return out;

    const end = new Date(dateToIso);
    end.setHours(23,59,59,0);

    let cursor = new Date(dateFromIso);
    cursor.setHours(0,0,0,0);

    while (cursor <= end) {
      const chunkStart = new Date(cursor);

      const chunkEnd = new Date(cursor);
      chunkEnd.setDate(chunkEnd.getDate() + (daysPerChunk - 1));
      chunkEnd.setHours(23,59,59,0);

      if (chunkEnd > end) chunkEnd.setTime(end.getTime());

      out.push({
        dateFrom: toIsoLocal(chunkStart),
        dateTo: toIsoLocal(chunkEnd)
      });

      cursor.setDate(cursor.getDate() + daysPerChunk);
      cursor.setHours(0,0,0,0);
    }

    return out;
  }

  function buildRanges(ctx) {
    const f = ctx.filters || {};
    if (!f.dateFrom || !f.dateTo) return [];

    // 7 dias é ok; o service pode pedir 3 dias no fallback
    const chunks = makeDayChunks(f.dateFrom, f.dateTo, 7);

    log('[PeriodFilter] chunks=' + chunks.length, { from: f.dateFrom, to: f.dateTo });
    return chunks;
  }

  // usado pelo service no fallback também
  function splitRange(range, daysPerChunk) {
    return makeDayChunks(range.dateFrom, range.dateTo, daysPerChunk);
  }

  function applyToFilter(ctx, baseFilter, range) {
    if (range && range.dateFrom) baseFilter[">=CALL_START_DATE"] = isoToSpace(range.dateFrom);
    if (range && range.dateTo)   baseFilter["<=CALL_START_DATE"] = isoToSpace(range.dateTo);
    return baseFilter;
  }

  App.modules.TelefoniaFilterPeriod = {
    buildRanges,
    splitRange,
    applyToFilter
  };
})(window);