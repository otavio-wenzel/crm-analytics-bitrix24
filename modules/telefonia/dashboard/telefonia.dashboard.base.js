(function (global) {
  const App = global.App = global.App || {};
  const refs = App.ui.refs;

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

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
        `<div class="placeholder">${escapeHtml(message || 'Carregando dados de telefonia...')}</div>`;
    }
  }

  function renderError(message) {
    if (!refs.dashboardContentEl) return;
    refs.dashboardContentEl.innerHTML =
      `<div class="placeholder">${escapeHtml(message || 'Erro ao carregar dados.')}</div>`;
  }

  // ✅ NOVO: HTML padrão de “sem dados”
  function emptyHtml(message) {
    return `<div class="placeholder">${escapeHtml(message || 'Nenhum resultado encontrado para os filtros selecionados.')}</div>`;
  }

  // ✅ NOVO: render padrão de “sem dados” (tela inteira)
  function renderEmpty(message) {
    if (!refs.dashboardContentEl) return;
    refs.dashboardContentEl.innerHTML = emptyHtml(message);
  }

  App.modules.TelefoniaDashboardBase = {
    escapeHtml,
    formatHMS,
    showLoading,
    renderError,
    emptyHtml,
    renderEmpty
  };
})(window);