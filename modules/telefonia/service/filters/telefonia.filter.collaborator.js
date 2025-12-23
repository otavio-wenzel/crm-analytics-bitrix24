(function (global) {
  const App = global.App = global.App || {};
  App.modules = App.modules || {};

  function applyCollaborator(ctx, baseFilter) {
    // collaboratorId pode ser null/"all"
    if (ctx.filters && ctx.filters.collaboratorId && ctx.filters.collaboratorId !== 'all') {
      baseFilter["PORTAL_USER_ID"] = String(ctx.filters.collaboratorId);
    }
    return baseFilter;
  }

  App.modules.TelefoniaFilterCollaborator = { apply: applyCollaborator };
})(window);