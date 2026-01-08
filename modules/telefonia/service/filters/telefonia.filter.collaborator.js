//telefonia.filter.collaborator.js
(function (global) {
  const App = global.App = global.App || {};
  App.modules = App.modules || {};

  function applyCollaborator(ctx, baseFilter) {
    const f = ctx?.filters || {};

    // multi
    if (f.collaboratorIds && Array.isArray(f.collaboratorIds) && f.collaboratorIds.length) {
      baseFilter["PORTAL_USER_ID"] = f.collaboratorIds.map(String);
      return baseFilter;
    }

    // single (legado)
    if (f.collaboratorId && f.collaboratorId !== 'all' && f.collaboratorId !== 'none') {
      baseFilter["PORTAL_USER_ID"] = String(f.collaboratorId);
      return baseFilter;
    }

    // none/all => não filtra
    return baseFilter;
  }

  App.modules.TelefoniaFilterCollaborator = { apply: applyCollaborator };
})(window);