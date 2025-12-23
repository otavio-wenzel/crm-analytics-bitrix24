(function (global) {
  const App  = global.App = global.App || {};
  const log  = App.log || function(){};
  const refs = App.ui.refs;

  const Service  = App.modules.TelefoniaService;
  const BaseDash = App.modules.TelefoniaDashboardBase;

  const Dashboards = {
    overview: App.modules.TelefoniaDashboardOverview,
    chamadas_recebidas: App.modules.TelefoniaDashboardInbound,
    chamadas_realizadas: App.modules.TelefoniaDashboardOutbound,
    analise_comercial: App.modules.TelefoniaDashboardCommercial
  };

  let _dataJobSeq = 0;
  let _collabJobSeq = 0;

  App.state.telefoniaJobs = App.state.telefoniaJobs || {
    data:   { id: 0, canceled: false },
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

  // ====== DOM helpers ======
  function getFilterEls() {
    return {
      // normal
      collaboratorSel: document.getElementById('filter-collaborator'),

      // comercial
      callTypeSel: document.getElementById('filter-calltype'),
      usersModeSel: document.getElementById('filter-users-mode'),
      usersMultiSel: document.getElementById('filter-users'),
      metricSel: document.getElementById('filter-metric'),
      statusSel: document.getElementById('filter-status'),

      // comum
      periodSel: document.getElementById('filter-period'),
      fromInput: document.getElementById('filter-from'),
      toInput: document.getElementById('filter-to'),
      applyBtn: document.getElementById('btn-apply-filters')
    };
  }

  function setUiLoadingState(isLoading) {
    const {
      collaboratorSel,
      callTypeSel, usersModeSel, usersMultiSel, metricSel, statusSel,
      periodSel, fromInput, toInput, applyBtn
    } = getFilterEls();

    const disabled = !!isLoading;

    if (collaboratorSel) collaboratorSel.disabled = disabled;

    if (callTypeSel)  callTypeSel.disabled  = disabled;
    if (usersModeSel) usersModeSel.disabled = disabled;
    if (usersMultiSel) usersMultiSel.disabled = disabled || (usersModeSel && usersModeSel.value !== 'select');
    if (metricSel) metricSel.disabled = disabled;
    if (statusSel) statusSel.disabled = true; // sempre desabilitado por enquanto

    if (periodSel) periodSel.disabled = disabled;
    if (fromInput) fromInput.disabled = disabled;
    if (toInput)   toInput.disabled   = disabled;
    if (applyBtn)  applyBtn.disabled  = disabled;

    if (refs.sidebarSubBtns) refs.sidebarSubBtns.forEach(btn => btn.disabled = disabled);
    if (refs.sidebarModuleBtns) refs.sidebarModuleBtns.forEach(btn => btn.disabled = disabled);
  }

  // ====== render filtros ======
  function renderFilters(container, viewId) {
    const isCommercial = (viewId === 'analise_comercial');

    container.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">

        ${isCommercial ? `
          <div>
            <label>Tipo de ligação:</label><br>
            <select id="filter-calltype">
              <option value="none" selected>Nenhum (todas)</option>
              <option value="inbound">Recebidas</option>
              <option value="outbound">Realizadas</option>
            </select>
          </div>

          <div>
            <label>Usuários:</label><br>
            <select id="filter-users-mode">
              <option value="all" selected>Todos</option>
              <option value="select">Selecionar...</option>
            </select>
          </div>

          <div>
            <label>Seleção de usuários:</label><br>
            <select id="filter-users" multiple size="6" disabled style="min-width:240px;">
              <option value="_loading" disabled>Carregando...</option>
            </select>
          </div>

          <div>
            <label>Métrica:</label><br>
            <select id="filter-metric">
              <option value="calls" selected>Qualquer (ligações)</option>
              <option value="unique_numbers">Somente números únicos</option>
            </select>
          </div>

          <div>
            <label>Status:</label><br>
            <select id="filter-status" disabled>
              <option selected>Em breve</option>
            </select>
          </div>
        ` : `
          <div>
            <label>Colaborador:</label><br>
            <select id="filter-collaborator">
              <option value="all" selected>Todos</option>
              <option value="_loading" disabled>Carregando...</option>
            </select>
          </div>
        `}

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
    if (periodSel && customBox) {
      periodSel.addEventListener('change', function () {
        customBox.style.display = (this.value === 'custom') ? 'inline-block' : 'none';
      });
    }

    if (isCommercial) {
      const modeSel  = document.getElementById('filter-users-mode');
      const usersSel = document.getElementById('filter-users');

      if (modeSel && usersSel) {
        modeSel.addEventListener('change', function () {
          usersSel.disabled = (this.value !== 'select');
        });
      }

      loadCollaboratorsForCommercial().catch(e => log('[TelefoniaModule] erro load comercial users', e));
    } else {
      loadCollaboratorsIntoSelect().catch(e => log('[TelefoniaModule] erro load colaboradores', e));
    }
  }

  // ====== load colaboradores: normal (select único) ======
  async function loadCollaboratorsIntoSelect() {
    const job = startNewCollabJob();
    const sel = document.getElementById('filter-collaborator');
    if (!sel) return;

    const token = String(job.id);
    sel.dataset.loadToken = token;

    const previousValue = sel.value || 'all';

    sel.innerHTML = `
      <option value="all" selected>Todos</option>
      <option value="_loading" disabled>Carregando...</option>
    `;

    function stillValid() {
      const current = document.getElementById('filter-collaborator');
      return current && current.dataset.loadToken === token;
    }

    try {
      const users = await Promise.race([
        Service.getActiveCollaborators(job),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_COLLAB')), 20000))
      ]);

      if (job.canceled || !stillValid()) return;

      sel.innerHTML = `<option value="all">Todos</option>`;

      (users || []).forEach(u => {
        const opt = document.createElement('option');
        opt.value = String(u.ID);
        opt.textContent = u.NAME;
        sel.appendChild(opt);
      });

      const exists = Array.from(sel.options).some(o => o.value === previousValue);
      sel.value = exists ? previousValue : 'all';

    } catch (e) {
      if (!stillValid()) return;
      const msg = (e && e.message) ? e.message : String(e || '');
      log('[TelefoniaModule] colaboradores falhou', msg);
      sel.innerHTML = `<option value="all" selected>Todos</option>`;
    } finally {
      if (!stillValid()) return;
      const loadingOpt = sel.querySelector('option[value="_loading"]');
      if (loadingOpt) loadingOpt.remove();
    }
  }

  // ====== load colaboradores: comercial (multi-select) ======
  async function loadCollaboratorsForCommercial() {
    const job = startNewCollabJob();
    const sel = document.getElementById('filter-users');
    if (!sel) return;

    const token = String(job.id);
    sel.dataset.loadToken = token;

    // preserva selecionados atuais (se trocar de view e voltar)
    const prevSelected = new Set(Array.from(sel.selectedOptions || []).map(o => o.value));

    sel.innerHTML = `<option value="_loading" disabled>Carregando...</option>`;

    function stillValid() {
      const current = document.getElementById('filter-users');
      return current && current.dataset.loadToken === token;
    }

    try {
      const users = await Promise.race([
        Service.getActiveCollaborators(job),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_COLLAB')), 20000))
      ]);

      if (job.canceled || !stillValid()) return;

      sel.innerHTML = '';

      (users || []).forEach(u => {
        const opt = document.createElement('option');
        opt.value = String(u.ID);
        opt.textContent = u.NAME;
        if (prevSelected.has(opt.value)) opt.selected = true;
        sel.appendChild(opt);
      });

    } catch (e) {
      if (!stillValid()) return;
      const msg = (e && e.message) ? e.message : String(e || '');
      log('[TelefoniaModule] comercial colaboradores falhou', msg);
      sel.innerHTML = ''; // evita ficar preso no "Carregando..."
    } finally {
      if (!stillValid()) return;
      const loadingOpt = sel.querySelector('option[value="_loading"]');
      if (loadingOpt) loadingOpt.remove();
    }
  }

  // ====== período ======
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
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
      dateFrom = fmt(start);
      dateTo   = fmt(end);

    } else if (period.endsWith('d') && period !== 'custom') {
      const days = parseInt(period.replace('d',''), 10) - 1;
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - days);
      const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0,0,0);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
      dateFrom = fmt(start);
      dateTo   = fmt(end);

    } else if (period === 'custom') {
      const fromVal = fromInput && fromInput.value;
      const toVal   = toInput && toInput.value;

      if (!fromVal || !toVal) return { error: 'Selecione data inicial e final.' };

      dateFrom = fromVal + 'T00:00:00';
      dateTo   = toVal   + 'T23:59:59';

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

  function getCommercialFiltersFromUI() {
    const {
      callTypeSel, usersModeSel, usersMultiSel, metricSel
    } = getFilterEls();

    const callType   = callTypeSel ? callTypeSel.value : 'none';
    const usersMode  = usersModeSel ? usersModeSel.value : 'all';
    const metric     = metricSel ? metricSel.value : 'calls';

    let collaboratorIds = [];
    if (usersMode === 'select' && usersMultiSel) {
      collaboratorIds = Array.from(usersMultiSel.selectedOptions || [])
        .map(o => o.value)
        .filter(v => v && v !== '_loading');
    }

    return { callType, usersMode, metric, collaboratorIds };
  }

  // ====== load + render ======
  async function loadAndRender(viewId) {
    const job = startNewDataJob();
    App.state.activeViewId = viewId;

    const period = computeDateRangeFromUI();
    if (period && period.error) {
      BaseDash.renderError(`Filtro inválido: ${period.error}`);
      return;
    }

    setUiLoadingState(true);
    BaseDash.showLoading(true, 'Carregando dados de telefonia...');

    try {
      let data;
      let filters;

      if (viewId === 'analise_comercial') {
        const commercial = getCommercialFiltersFromUI();
        filters = {
          ...commercial,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo
          // status: depois
        };

        log('[TelefoniaModule] loadAndRender (commercial)', { viewId, ...filters, jobId: job.id });

        data = await Service.fetchAnaliseComercial(filters, job);

      } else {
        const collaboratorId = getCollaboratorFromUI();

        filters = {
          collaboratorId,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo
        };

        log('[TelefoniaModule] loadAndRender', { viewId, ...filters, jobId: job.id });

        if (viewId === 'overview') data = await Service.fetchOverview(filters, job);
        else if (viewId === 'chamadas_recebidas') data = await Service.fetchChamadasRecebidas(filters, job);
        else if (viewId === 'chamadas_realizadas') data = await Service.fetchChamadasRealizadas(filters, job);
        else data = await Service.fetchOverview(filters, job);
      }

      if (job.canceled) return;

      const dash = Dashboards[viewId] || Dashboards.overview;
      dash.render(data, filters);

    } catch (e) {
      if (job.canceled) return;

      const msg = (e && e.message) ? e.message : String(e || '');
      log('[TelefoniaModule] ERRO', msg);

      if (msg === 'TIMEOUT') {
        BaseDash.renderError('Timeout ao carregar dados. Tente um período menor ou selecione usuários específicos.');
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