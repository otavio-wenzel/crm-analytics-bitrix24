//telefonia.filter.calltype.js
(function (global) {
  const App = global.App = global.App || {};
  App.modules = App.modules || {};

  // Voximplant:
  // 1 = outgoing (realizadas)
  // 2 = incoming (recebidas)
  // 3 = incoming redirected (recebidas)
  const OUTGOING = 1;
  const INCOMING = 2;
  const INCOMING_REDIRECTED = 3;

  function apply(ctx, baseFilter) {
    const f = baseFilter || {};

    // ✅ guard total (evita "Cannot read properties of undefined (reading 'callType')")
    const filters = ctx && ctx.filters ? ctx.filters : {};
    const callType = filters.callType || 'none'; // none|inbound|outbound

    if (callType === 'outbound') {
      f["CALL_TYPE"] = OUTGOING;
    } else if (callType === 'inbound') {
      // Alguns portais aceitam array, outros não.
      // O service fará fallback (2 chamadas) se der erro.
      f["CALL_TYPE"] = [INCOMING, INCOMING_REDIRECTED];
    }

    return f;
  }

  App.modules.TelefoniaFilterCallType = { apply };
})(window);