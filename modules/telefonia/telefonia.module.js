(function (global) {
  const App  = global.App = global.App || {};
  const log  = App.log || function(){};
  const refs = App.ui.refs;

  const Service = App.modules.TelefoniaService;
  const BaseDash = App.modules.TelefoniaDashboardBase;

  const Dashboards = {
    overview: App.modules.TelefoniaDashboardOverview,
    chamadas_recebidas: App.modules.TelefoniaDashboardInbound,
    chamadas_realizadas: App.modules.TelefoniaDashboardOutbound
  };

    let _dataJobSeq = 0;
    let _collabJobSeq = 0;

    App.state.telefoniaJobs = App.state.telefoniaJobs || {
    data: { id: 0, canceled: false },
    collab: { id: 0, canceled: false }
    };

    function startNewDataJob() {
    if (App.state.telefoniaJobs.data) App.state.telefoniaJobs.data.canceled = true;
    const job = { id: ++_dataJobSeq, canceled: false };
    App.state.telefoniaJobs.data = job;
    return job;
    }

    function startNewCollabJob() {
    if (App.state.telefoniaJobs.collab) App.state.telefoniaJobs.collab.canceled = true;
    const job = { id: ++_collabJobSeq, canceled: false };
    App.state.telefoniaJobs.collab = job;
    return job;
    }

  function getFilterEls() {
    return {
      collaboratorSel: document.getElementById('filter-collaborator'),
      periodSel: document.getElementById('filter-period'),
      fromInput: document.getElementById('filter-from'),
      toInput: document.getElementById('filter-to'),
      applyBtn: document.getElementById('btn-apply-filters')
    };
  }

  function setUiLoadingState(isLoading) {
    const { collaboratorSel, periodSel, fromInput, toInput, applyBtn } = getFilterEls();

    if (collaboratorSel) collaboratorSel.disabled = !!isLoading;
    if (periodSel) periodSel.disabled = !!isLoading;
    if (fromInput) fromInput.disabled = !!isLoading;
    if (toInput) toInput.disabled = !!isLoading;
    if (applyBtn) applyBtn.disabled = !!isLoading;

    if (refs.sidebarSubBtns) refs.sidebarSubBtns.forEach(btn => btn.disabled = !!isLoading);
    if (refs.sidebarModuleBtns) refs.sidebarModuleBtns.forEach(btn => btn.disabled = !!isLoading);
  }

  function renderFilters(container) {
    container.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
        <div>
          <label>Colaborador:</label><br>
          <select id="filter-collaborator">
            <option value="all" selected>Todos</option>
            <option value="_loading" disabled>Carregando...</option>
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
            <option value="365d">Último ano (365 dias)</option>
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

    // carrega colaboradores (async, não trava UI inteira)
    loadCollaboratorsIntoSelect().catch(e => {
      log('[TelefoniaModule] erro load colaboradores', e);
    });
  }

    async function loadCollaboratorsIntoSelect() {
    const job = startNewCollabJob();
    const sel = document.getElementById('filter-collaborator');
    if (!sel) return;

    sel.innerHTML = `<option value="all" selected>Todos</option>
                    <option value="_loading" disabled>Carregando...</option>`;

    try {
        const users = await Service.getActiveCollaborators(job);

        // ✅ se foi cancelado, pelo menos limpa o "Carregando..."
        if (job.canceled) {
        sel.innerHTML = `<option value="all" selected>Todos</option>`;
        return;
        }

        sel.innerHTML = `<option value="all" selected>Todos</option>`;
        (users || []).forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.ID;
        opt.textContent = u.NAME;
        sel.appendChild(opt);
        });

    } catch (e) {
        if (!job.canceled) {
        sel.innerHTML = `<option value="all" selected>Todos</option>`;
        }
    }
    }

  function computeDateRangeFromUI() {
    const { periodSel, fromInput, toInput } = getFilterEls();
    const period = periodSel ? periodSel.value : 'today';

    let dateFrom = null;
    let dateTo = null;

    function fmt(d) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      const hh = String(d.getHours()).padStart(2,'0');
      const mi = String(d.getMinutes()).padStart(2,'0');
      const ss = String(d.getSeconds()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }

    const now = new Date();

    if (period === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
      dateFrom = fmt(start);
      dateTo = fmt(end);

    } else if (period.endsWith('d') && period !== 'custom') {
      const days = parseInt(period.replace('d',''), 10) - 1;
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - days);
      const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0,0,0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
      dateFrom = fmt(start);
      dateTo = fmt(end);

    } else if (period === 'custom') {
      const fromVal = fromInput && fromInput.value;
      const toVal = toInput && toInput.value;

      if (!fromVal || !toVal) return { error: 'Selecione data inicial e final.' };

      dateFrom = fromVal + 'T00:00:00';
      dateTo = toVal + 'T23:59:59';

      if (new Date(dateFrom) > new Date(dateTo)) {
        return { error: 'A data inicial não pode ser maior que a data final.' };
      }
    }

    return { period, dateFrom, dateTo };
  }

  function getCollaboratorFromUI() {
    const { collaboratorSel } = getFilterEls();
    const v = collaboratorSel ? collaboratorSel.value : 'all';
    return (v && v !== '_loading') ? v : 'all';
  }

  async function loadAndRender(viewId) {
    const job = startNewDataJob();
    App.state.activeViewId = viewId;

    const period = computeDateRangeFromUI();
    if (period && period.error) {
      BaseDash.renderError(`Filtro inválido: ${period.error}`);
      return;
    }

    const collaboratorId = getCollaboratorFromUI();

    const filters = {
      collaboratorId,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo
    };

    log('[TelefoniaModule] loadAndRender', { viewId, ...filters, jobId: job.id });

    setUiLoadingState(true);
    BaseDash.showLoading(true, 'Carregando dados de telefonia...');

    try {
      let data;
      if (viewId === 'overview') data = await Service.fetchOverview(filters, job);
      else if (viewId === 'chamadas_recebidas') data = await Service.fetchChamadasRecebidas(filters, job);
      else if (viewId === 'chamadas_realizadas') data = await Service.fetchChamadasRealizadas(filters, job);
      else data = await Service.fetchOverview(filters, job);

      if (job.canceled) return;

      const dash = Dashboards[viewId] || Dashboards.overview;
      dash.render(data, filters);

    } catch (e) {
      if (job.canceled) return;

      const msg = (e && e.message) ? e.message : String(e || '');
      log('[TelefoniaModule] ERRO', msg);

      if (msg === 'TIMEOUT') {
        BaseDash.renderError('Timeout ao carregar dados. Tente um período menor ou um colaborador específico.');
      } else {
        BaseDash.renderError('Erro ao carregar dados de telefonia.');
      }
    } finally {
      if (!job.canceled) {
        BaseDash.showLoading(false);
        setUiLoadingState(false);
      }
    }
  }

  window.addEventListener('beforeunload', function () {
    if (App.state.telefoniaJobs?.data) App.state.telefoniaJobs.data.canceled = true;
    if (App.state.telefoniaJobs?.collab) App.state.telefoniaJobs.collab.canceled = true;
    });


  App.modules.telefonia = {
    id: 'telefonia',
    label: 'Telefonia',
    renderFilters,
    loadAndRender
  };
})(window);