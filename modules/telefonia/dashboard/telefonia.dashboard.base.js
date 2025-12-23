(function (global) {
  const App = global.App = global.App || {};
  const refs = App.ui.refs;

  function formatHMS(totalSeconds) {
    const s = Math.max(0, parseInt(totalSeconds, 10) || 0);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }

  function showLoading(isLoading, message) {
    if (!refs.dashboardContentEl) return;
    if (isLoading) {
      refs.dashboardContentEl.innerHTML =
        `<div class="placeholder">${message || 'Carregando dados de telefonia...'}</div>`;
    }
  }

  function renderError(message) {
    if (!refs.dashboardContentEl) return;
    refs.dashboardContentEl.innerHTML =
      `<div class="placeholder">${message || 'Erro ao carregar dados.'}</div>`;
  }

  App.modules.TelefoniaDashboardBase = {
    formatHMS,
    showLoading,
    renderError
  };
})(window);