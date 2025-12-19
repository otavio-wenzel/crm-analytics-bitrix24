(function (global) {
  const App  = global.App = global.App || {};
  const log  = App.log || function(){};
  const refs = App.ui.refs;

  const Service   = App.modules.TelefoniaService;
  const Dashboard = App.modules.TelefoniaDashboard;

  let _jobSeq = 0;
  App.state.telefoniaJob = App.state.telefoniaJob || { id: 0, canceled: false };

  function startNewJob() {
    // cancela o anterior
    if (App.state.telefoniaJob) App.state.telefoniaJob.canceled = true;
    const job = { id: ++_jobSeq, canceled: false };
    App.state.telefoniaJob = job;
    return job;
  }

  function getFilterEls() {
    return {
      periodSel: document.getElementById('filter-period'),
      fromInput: document.getElementById('filter-from'),
      toInput: document.getElementById('filter-to'),
      applyBtn: document.getElementById('btn-apply-filters'),
    };
  }

  function setUiLoadingState(isLoading) {
    const { periodSel, fromInput, toInput, applyBtn } = getFilterEls();

    if (periodSel) periodSel.disabled = !!isLoading;
    if (fromInput) fromInput.disabled = !!isLoading;
    if (toInput)   toInput.disabled   = !!isLoading;
    if (applyBtn)  applyBtn.disabled  = !!isLoading;

    // opcional: trava também o menu lateral durante requisição
    if (refs.sidebarSubBtns) {
      refs.sidebarSubBtns.forEach(btn => btn.disabled = !!isLoading);
    }
    if (refs.sidebarModuleBtns) {
      refs.sidebarModuleBtns.forEach(btn => btn.disabled = !!isLoading);
    }
  }

  // Monta a barra de filtros
  function renderFilters(container, viewId) {
    container.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
        <div>
          <label>Período:</label><br>
          <select id="filter-period">
            <option value="today" selected>Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="all">Desde sempre</option>
            <option value="custom">Personalizado...</option>
          </select>
        </div>

        <div id="custom-period-container" style="display:none;">
          <label>Intervalo personalizado:</label><br>
          <input type="date" id="filter-from">
          <input type="date" id="filter-to">
        </div>

        <div style="align-self:flex-end;">
          <button id="btn-apply-filters" type="button">Aplicar filtros</button>
        </div>
      </div>
    `;

    const periodSel = document.getElementById('filter-period');
    const customBox = document.getElementById('custom-period-container');

    periodSel.addEventListener('change', function () {
      customBox.style.display = (this.value === 'custom') ? 'inline-block' : 'none';
    });
  }

  // Converte o filtro selecionado em intervalo de datas para a API
  function computeDateRangeFromFilters() {
    const sel = document.getElementById('filter-period');
    const period = sel ? sel.value : 'today';

    let dateFrom = null;
    let dateTo   = null;

    function fmt(d) {
      const yyyy = d.getFullYear();
      const mm   = String(d.getMonth() + 1).padStart(2,'0');
      const dd   = String(d.getDate()).padStart(2,'0');
      const hh   = String(d.getHours()).padStart(2,'0');
      const mi   = String(d.getMinutes()).padStart(2,'0');
      const ss   = String(d.getSeconds()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }

    const now = new Date();

    if (period === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
      dateFrom = fmt(start);
      dateTo   = fmt(end);
    } else if (period === '7d' || period === '30d') {
      const days = (period === '7d') ? 6 : 29;
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - days);
      const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0,0,0);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
      dateFrom = fmt(start);
      dateTo   = fmt(end);
    } else if (period === 'custom') {
      const fromInput = document.getElementById('filter-from');
      const toInput   = document.getElementById('filter-to');
      const fromVal = fromInput && fromInput.value;
      const toVal   = toInput && toInput.value;

      if (!fromVal || !toVal) {
        return { period, error: 'Selecione data inicial e final.' };
      }

      dateFrom = fromVal + 'T00:00:00';
      dateTo   = toVal   + 'T23:59:59';

      if (new Date(dateFrom) > new Date(dateTo)) {
        return { period, error: 'A data inicial não pode ser maior que a data final.' };
      }
    } else if (period === 'all') {
      // mantém null => sem filtro de data (desde sempre)
    }

    return { period, dateFrom, dateTo };
  }

  async function loadAndRender(viewId) {
    const job = startNewJob();
    App.state.activeViewId = viewId;

    const filters = computeDateRangeFromFilters();
    if (filters && filters.error) {
      Dashboard.renderError(`Filtro inválido: ${filters.error}`);
      return;
    }

    log('[TelefoniaModule] loadAndRender view=' + viewId, { ...filters, jobId: job.id });

    setUiLoadingState(true);
    Dashboard.showLoading(true);

    try {
      let data;

      if (viewId === 'overview') {
        data = await Service.fetchOverview(filters, job);
        if (job.canceled) return;
        Dashboard.renderOverview(data, filters);

      } else if (viewId === 'chamadas_recebidas') {
        data = await Service.fetchChamadasRecebidas(filters, job);
        if (job.canceled) return;
        Dashboard.renderChamadasRecebidas(data, filters);

      } else if (viewId === 'chamadas_realizadas') {
        data = await Service.fetchChamadasRealizadas(filters, job);
        if (job.canceled) return;
        Dashboard.renderChamadasRealizadas(data, filters);

      } else {
        data = await Service.fetchOverview(filters, job);
        if (job.canceled) return;
        Dashboard.renderOverview(data, filters);
      }

    } catch (e) {
      if (job.canceled) return;

      const msg = (e && e.message) ? e.message : String(e || '');
      log('[TelefoniaModule] ERRO loadAndRender', msg);

      if (msg === 'TIMEOUT') {
        Dashboard.renderError('Timeout ao carregar dados (Bitrix não respondeu a tempo). Tente um período menor.');
      } else {
        Dashboard.renderError('Erro ao carregar dados de telefonia.');
      }
    } finally {
      if (!job.canceled) {
        Dashboard.showLoading(false);
        setUiLoadingState(false);
      }
    }
  }

  // garante cancelamento ao sair/recarregar
  window.addEventListener('beforeunload', function () {
    if (App.state.telefoniaJob) App.state.telefoniaJob.canceled = true;
  });

  App.modules.telefonia = {
    id: 'telefonia',
    label: 'Telefonia',
    renderFilters,
    loadAndRender
  };
})(window);