(function (global) {
  const App = global.App = global.App || {};
  App.modules = App.modules || {};

  // Voximplant CALL_TYPE
  // 1 outgoing
  // 2 incoming
  // 3 incoming redirected
  const OUT = 1;
  const IN  = 2;
  const INR = 3;

  function apply(ctx, baseFilter) {
    const t = ctx?.filters?.callType;

    // "none" / vazio => não aplica filtro
    if (!t || t === 'none') return baseFilter;

    // OBS: alguns endpoints aceitam array em filtro. Se não aceitar, vamos tratar fallback no service.
    if (t === 'outbound') {
      baseFilter["CALL_TYPE"] = OUT;
      return baseFilter;
    }
    if (t === 'inbound') {
      baseFilter["CALL_TYPE"] = [IN, INR];
      return baseFilter;
    }

    return baseFilter;
  }

  App.modules.TelefoniaFilterCallType = { apply };
})(window);