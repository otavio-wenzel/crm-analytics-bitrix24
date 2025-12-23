(function (global) {
  const App  = global.App = global.App || {};
  const log  = App.log || function(){};
  const refs = App.ui && App.ui.refs ? App.ui.refs : {};

  App.state = App.state || {};

  // ===== JOB de DADOS (sub-sessões)
  let _jobSeq = 0;
  App.state.telefoniaJob = App.state.telefoniaJob || { id: 0, canceled: false };

  function startNewDataJob() {
    if (App.state.telefoniaJob) App.state.telefoniaJob.canceled = true;
    const job = { id: ++_jobSeq, canceled: false };
    App.state.telefoniaJob = job;
    return job;
  }

  function isLatestDataJob(job) {
    return App.state.telefoniaJob && App.state.telefoniaJob.id === job.id;
  }

  // ===== JOB de COLABORADORES (separado, NÃO pode ser cancelado por loadAndRender)
  let _usersJobSeq = 0;
  App.state.telefoniaUsersJob = App.state.telefoniaUsersJob || { id: 0, canceled: false };

  function startNewUsersJob() {
    if (App.state.telefoniaUsersJob) App.state.telefoniaUsersJob.canceled = true;
    const job = { id: ++_usersJobSeq, canceled: false };
    App.state.telefoniaUsersJob = job;
    return job;
  }

  function isLatestUsersJob(job) {
    return App.state.telefoniaUsersJob && App.state.telefoniaUsersJob.id === job.id;
  }

  function getFilterEls() {
    return {
      collabSel: document.getElementById('filter-collab'),
      periodSel: document.getElementById('filter-period'),
      fromInput: document.getElementById('filter-from'),
      toInput:   document.getElementById('filter-to'),
      customBox: document.getElementById('custom-period-container'),
      applyBtn:  document.getElementById('btn-apply-filters'),
    };
  }

  function setUiLoadingState(isLoading) {
    const { collabSel, periodSel, fromInput, toInput, applyBtn } = getFilterEls();

    if (collabSel) collabSel.disabled = !!isLoading;
    if (periodSel) periodSel.disabled = !!isLoading;
    if (fromInput) fromInput.disabled = !!isLoading;
    if (toInput)   toInput.disabled   = !!isLoading;
    if (applyBtn)  applyBtn.disabled  = !!isLoading;

    if (refs.sidebarSubBtns) refs.sidebarSubBtns.forEach(btn => btn.disabled = !!isLoading);
  }

  function fmtIso(d) {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    const hh   = String(d.getHours()).padStart(2,'0');
    const mi   = String(d.getMinutes()).padStart(2,'0');
    const ss   = String(d.getSeconds()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  function computeDateRange(period) {
    const now = new Date();
    if (period === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
      return { dateFrom: fmtIso(start), dateTo: fmtIso(end) };
    }

    const map = { '7d': 6, '30d': 29, '90d': 89, '180d': 179, '365d': 364 };
    if (map[period] != null) {
      const days = map[period];
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - days);
      const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0,0,0);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
      return { dateFrom: fmtIso(start), dateTo: fmtIso(end) };
    }

    return { dateFrom: null, dateTo: null };
  }

  function readFiltersFromUi() {
    const { collabSel, periodSel, fromInput, toInput } = getFilterEls();

    const collaboratorId = collabSel ? collabSel.value : 'all';
    const period = periodSel ? periodSel.value : 'today';

    if (period === 'custom') {
      const fromVal = fromInput && fromInput.value;
      const toVal   = toInput && toInput.value;

      if (!fromVal || !toVal) return { error: 'Selecione data inicial e final.' };

      const dateFrom = fromVal + 'T00:00:00';
      const dateTo   = toVal   + 'T23:59:59';

      if (new Date(dateFrom) > new Date(dateTo)) {
        return { error: 'A data inicial não pode ser maior que a data final.' };
      }

      return {
        collaboratorId: (collaboratorId === 'all') ? null : collaboratorId,
        period,
        dateFrom,
        dateTo
      };
    }

    const r = computeDateRange(period);
    return {
      collaboratorId: (collaboratorId === 'all') ? null : collaboratorId,
      period,
      dateFrom: r.dateFrom,
      dateTo: r.dateTo
    };
  }

  async function fillCollaboratorsSelect() {
    const { collabSel } = getFilterEls();
    if (!collabSel) return;

    const usersJob = startNewUsersJob();

    // estado inicial coerente
    collabSel.innerHTML = `<option value="all">Todos</option><option value="_loading">Carregando...</option>`;
    collabSel.value = 'all';

    try {
      const Service = App.modules && App.modules.TelefoniaService;
      if (!Service || typeof Service.getActiveCollaborators !== 'function') {
        collabSel.innerHTML = `<option value="all">Todos</option>`;
        return;
      }

      const users = await Service.getActiveCollaborators(usersJob);

      // se cancelou, ainda assim GARANTE que não fica preso em loading
      if (!isLatestUsersJob(usersJob) || usersJob.canceled) {
        collabSel.innerHTML = `<option value="all">Todos</option>`;
        collabSel.value = 'all';
        return;
      }

      const opts = [`<option value="all">Todos</option>`]
        .concat((users || []).map(u => `<option value="${u.ID}">${u.NAME}</option>`));

      collabSel.innerHTML = opts.join('');
      collabSel.value = 'all';

    } catch (e) {
      if (!isLatestUsersJob(usersJob) || usersJob.canceled) return;
      log('[TelefoniaModule] erro ao carregar colaboradores', e);
      collabSel.innerHTML = `<option value="all">Todos</option>`;
      collabSel.value = 'all';
    }
  }

  function renderFilters(container) {
    container.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
        <div>
          <label>Colaborador:</label><br>
          <select id="filter-collab">
            <option value="all" selected>Todos</option>
          </select>
        </div>

        <div>
          <label>Período:</label><br>
          <select id="filter-period">
            <option value="today" selected>Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="180d">Últimos 180 dias</option>
            <option value="365d">Últimos 365 dias</option>
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

    const { periodSel, customBox, applyBtn } = getFilterEls();

    if (periodSel && customBox) {
      periodSel.addEventListener('change', function () {
        customBox.style.display = (this.value === 'custom') ? 'inline-block' : 'none';
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        // recarrega a sub-view atual
        const viewId = App.state.activeViewId || 'overview';
        loadAndRender(viewId);
      });
    }

    // carrega colaboradores sem depender do job de dados
    fillCollaboratorsSelect().catch(()=>{});
  }

  async function loadAndRender(viewId) {
    const job = startNewDataJob();
    App.state.activeViewId = viewId;

    const Dashboard = App.modules && App.modules.TelefoniaDashboard;
    if (!Dashboard) return;

    const Service = App.modules && App.modules.TelefoniaService;
    if (!Service) {
      Dashboard.renderError('TelefoniaService não carregou (ordem dos scripts).');
      return;
    }

    const filters = readFiltersFromUi();
    if (filters && filters.error) {
      Dashboard.renderError(`Filtro inválido: ${filters.error}`);
      return;
    }

    log('[TelefoniaModule] loadAndRender', { viewId, ...filters, jobId: job.id });

    setUiLoadingState(true);
    Dashboard.showLoading(true);

    try {
      let data;

      if (viewId === 'overview') {
        data = await Service.fetchOverview(filters, job);
        if (!isLatestDataJob(job) || job.canceled) return;
        Dashboard.renderOverview(data, filters);

      } else if (viewId === 'chamadas_recebidas') {
        data = await Service.fetchChamadasRecebidas(filters, job);
        if (!isLatestDataJob(job) || job.canceled) return;
        Dashboard.renderChamadasRecebidas(data, filters);

      } else if (viewId === 'chamadas_realizadas') {
        data = await Service.fetchChamadasRealizadas(filters, job);
        if (!isLatestDataJob(job) || job.canceled) return;
        Dashboard.renderChamadasRealizadas(data, filters);

      } else {
        data = await Service.fetchOverview(filters, job);
        if (!isLatestDataJob(job) || job.canceled) return;
        Dashboard.renderOverview(data, filters);
      }

    } catch (e) {
      if (!isLatestDataJob(job) || job.canceled) return;

      const msg = (e && e.message) ? e.message : String(e || '');
      log('[TelefoniaModule] ERRO loadAndRender', msg);

      if (msg === 'TIMEOUT') {
        Dashboard.renderError('Timeout ao carregar dados. Tente um período menor (ou aguarde e tente novamente).');
      } else {
        Dashboard.renderError(`Erro ao carregar dados de telefonia: ${msg}`);
      }
    } finally {
      if (isLatestDataJob(job)) {
        Dashboard.showLoading(false);
        setUiLoadingState(false);
      }
    }
  }

  window.addEventListener('beforeunload', function () {
    if (App.state.telefoniaJob) App.state.telefoniaJob.canceled = true;
    if (App.state.telefoniaUsersJob) App.state.telefoniaUsersJob.canceled = true;
  });

  App.modules = App.modules || {};
  App.modules.telefonia = {
    id: 'telefonia',
    label: 'Telefonia',
    renderFilters,
    loadAndRender
  };
})(window);