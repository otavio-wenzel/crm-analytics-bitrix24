(function (global) {
  const App = global.App = global.App || {};
  const log = App.log || function(){};

  App.modules = App.modules || {};
  App.state = App.state || {};

  App.state.telefoniaCache = App.state.telefoniaCache || {
    users: null,
    usersTs: 0,
    userNameMap: new Map()
  };

  const CALLTYPE_OUTGOING = 1;
  const CALLTYPE_INCOMING = 2;
  const CALLTYPE_INCOMING_REDIRECTED = 3;

  function safeDurationSec(call) {
    const dur = parseInt(call.CALL_DURATION, 10);
    return Number.isFinite(dur) && dur > 0 ? dur : 0;
  }

  function directionBucket(call) {
    const t = parseInt(call.CALL_TYPE, 10) || 0;
    if (t === CALLTYPE_OUTGOING) return 'outbound';
    if (t === CALLTYPE_INCOMING || t === CALLTYPE_INCOMING_REDIRECTED) return 'inbound';
    return 'unknown';
  }

  function ensureUser(byUser, userId) {
    if (!byUser[userId]) {
      byUser[userId] = {
        userId,
        total: 0,
        inbound: 0,
        outbound: 0,
        answered: 0,
        missed: 0,
        totalDurationSeconds: 0
      };
    }
    return byUser[userId];
  }

  function aggregateOverview(calls) {
    const totals = {
      totalCalls: calls.length,
      inbound: 0,
      outbound: 0,
      unknown: 0,
      answered: 0,
      missed: 0,
      totalDurationSeconds: 0
    };

    const byUser = {};
    const byStatus = {};

    calls.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const bucket = directionBucket(c);
      const durSec = safeDurationSec(c);
      const ans = durSec > 0;

      if (bucket === 'inbound') totals.inbound++;
      else if (bucket === 'outbound') totals.outbound++;
      else totals.unknown++;

      const u = ensureUser(byUser, userId);
      u.total++;
      u.totalDurationSeconds += durSec;

      if (bucket === 'inbound') u.inbound++;
      else if (bucket === 'outbound') u.outbound++;

      totals.totalDurationSeconds += durSec;

      if (ans) { u.answered++; totals.answered++; }
      else { u.missed++; totals.missed++; }
    });

    return { totals, byUser: Object.values(byUser), byStatus: Object.values(byStatus) };
  }

  function aggregateInbound(calls) {
    const inbound = calls.filter(c => {
      const t = parseInt(c.CALL_TYPE, 10) || 0;
      return t === CALLTYPE_INCOMING || t === CALLTYPE_INCOMING_REDIRECTED;
    });

    const totals = { totalCalls: inbound.length, answered: 0, missed: 0, totalDurationSeconds: 0 };
    const byUser = {};

    inbound.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const durSec = safeDurationSec(c);
      const ans = durSec > 0;

      const u = ensureUser(byUser, userId);
      u.total++;
      u.totalDurationSeconds += durSec;

      totals.totalDurationSeconds += durSec;

      if (ans) { u.answered++; totals.answered++; }
      else { u.missed++; totals.missed++; }
    });

    return { totals, byUser: Object.values(byUser) };
  }

  function aggregateOutbound(calls) {
    const outbound = calls.filter(c => (parseInt(c.CALL_TYPE, 10) || 0) === CALLTYPE_OUTGOING);

    const totals = { totalCalls: outbound.length, answered: 0, missed: 0, totalDurationSeconds: 0 };
    const byUser = {};
    const byStatus = {};

    outbound.forEach(c => {
      const userId = c.PORTAL_USER_ID ? String(c.PORTAL_USER_ID) : '0';
      const durSec = safeDurationSec(c);
      const ans = durSec > 0;

      const u = ensureUser(byUser, userId);
      u.total++;
      u.totalDurationSeconds += durSec;

      totals.totalDurationSeconds += durSec;

      if (ans) { u.answered++; totals.answered++; }
      else { u.missed++; totals.missed++; }

      const code = (c.CALL_FAILED_CODE || 'SEM_CODIGO').toString();
      if (!byStatus[code]) byStatus[code] = { status: code, count: 0, totalDurationSeconds: 0 };
      byStatus[code].count++;
      byStatus[code].totalDurationSeconds += durSec;
    });

    return { totals, byUser: Object.values(byUser), byStatus: Object.values(byStatus) };
  }

  async function enrichWithUserNames(rows, job) {
    if (!rows || !rows.length) return rows;

    const ids = Array.from(new Set(
      rows.map(r => String(r.userId)).filter(id => id && id !== '0')
    ));
    if (!ids.length) return rows;

    const nameMap = App.state.telefoniaCache.userNameMap;
    const missing = ids.filter(id => !nameMap.has(id));

    const CONCURRENCY = 5;
    let idx = 0;

    async function fetchOne(id) {
      if (job && job.canceled) throw new Error('CANCELED');

      const res = await new Promise((resolve, reject) => {
        BX24.callMethod('user.get', { ID: id }, function (r) {
          if (r.error && r.error()) reject(r.error());
          else resolve(r);
        });
      });

      const list = (typeof res.data === 'function') ? (res.data() || []) : [];
      const u = list[0];
      if (u) {
        const fullName = ((u.NAME || '') + ' ' + (u.LAST_NAME || '')).trim();
        nameMap.set(id, fullName || id);
      }
    }

    async function worker() {
      while (idx < missing.length) {
        if (job && job.canceled) throw new Error('CANCELED');
        const id = missing[idx++];
        try { await fetchOne(id); }
        catch (e) { log('[TelefoniaCore] erro user.get ID=' + id, e); }
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, missing.length); i++) workers.push(worker());
    await Promise.all(workers);

    rows.forEach(r => {
      const id = String(r.userId);
      r.userName = nameMap.get(id) || id;
    });

    return rows;
  }

  App.modules.TelefoniaCore = {
    aggregateOverview,
    aggregateInbound,
    aggregateOutbound,
    enrichWithUserNames
  };
})(window);