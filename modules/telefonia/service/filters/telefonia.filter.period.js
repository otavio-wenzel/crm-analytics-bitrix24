// telefonia.filter.period.js
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

  // dif em dias "calendário" (inclusive), com base em datas locais
  function diffDaysInclusive(dateFromIso, dateToIso) {
    const a = new Date(dateFromIso);
    const b = new Date(dateToIso);
    if (!a.getTime() || !b.getTime()) return 0;

    // normaliza para 00:00:00 local
    a.setHours(0,0,0,0);
    b.setHours(0,0,0,0);

    const ms = b.getTime() - a.getTime();
    const days = Math.floor(ms / 86400000);
    return Math.max(0, days) + 1;
  }

  // ✅ chunks por "dias inteiros" (00:00:00 -> 23:59:59) sem buracos
  function makeDayChunks(dateFromIso, dateToIso, daysPerChunk) {
    const out = [];
    if (!dateFromIso || !dateToIso) return out;

    const end = new Date(dateToIso);
    end.setHours(23,59,59,0);

    let cursor = new Date(dateFromIso);
    cursor.setHours(0,0,0,0);

    const step = Math.max(1, parseInt(daysPerChunk, 10) || 1);

    while (cursor <= end) {
      const chunkStart = new Date(cursor);

      const chunkEnd = new Date(cursor);
      chunkEnd.setDate(chunkEnd.getDate() + (step - 1));
      chunkEnd.setHours(23,59,59,0);

      if (chunkEnd > end) chunkEnd.setTime(end.getTime());

      out.push({
        dateFrom: toIsoLocal(chunkStart),
        dateTo: toIsoLocal(chunkEnd)
      });

      cursor.setDate(cursor.getDate() + step);
      cursor.setHours(0,0,0,0);
    }

    return out;
  }

  // ✅ escolhe chunk size automaticamente para não gerar dezenas/centenas de chamadas
  function chooseDaysPerChunk(totalDays) {
    // alvo: não passar muito de ~30-40 chunks
    const MAX_CHUNKS_TARGET = 35;

    // heurística base
    let dpc = 7;
    if (totalDays > 45)  dpc = 14;
    if (totalDays > 120) dpc = 21;
    if (totalDays > 240) dpc = 30;
    if (totalDays > 540) dpc = 45;
    if (totalDays > 900) dpc = 60;

    // garante que chunks não explode (ex: 2000 dias)
    const minNeeded = Math.ceil(totalDays / MAX_CHUNKS_TARGET);
    if (minNeeded > dpc) dpc = minNeeded;

    // evita valores absurdos (deixa o service fazer split por TIMEOUT se precisar)
    dpc = Math.max(7, Math.min(dpc, 120));
    return dpc;
  }

  function buildRanges(ctx) {
    const f = ctx.filters || {};
    if (!f.dateFrom || !f.dateTo) return [];

    const totalDays = diffDaysInclusive(f.dateFrom, f.dateTo);
    const daysPerChunk = chooseDaysPerChunk(totalDays);

    const chunks = makeDayChunks(f.dateFrom, f.dateTo, daysPerChunk);

    log('[PeriodFilter] totalDays=' + totalDays + ' daysPerChunk=' + daysPerChunk + ' chunks=' + chunks.length, {
      from: f.dateFrom, to: f.dateTo
    });

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