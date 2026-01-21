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
    data: { id: 0, canceled: false },
    collab: { id: 0, canceled: false }
  };

  App.state.telefoniaCommercial = App.state.telefoniaCommercial || {
    selectedUserIds: new Set(),
    usersCache: []
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

  function isCurrentDataJob(job) {
    return !!(App.state.telefoniaJobs &&
              App.state.telefoniaJobs.data &&
              App.state.telefoniaJobs.data.id === job.id);
  }

  function nextPaint() {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
  }

  function getFilterEls() {
    return {
      collaboratorSel: document.getElementById('filter-collaborator'),

      periodSel: document.getElementById('filter-period'),
      fromInput: document.getElementById('filter-from'),
      toInput: document.getElementById('filter-to'),
      applyBtn: document.getElementById('btn-apply-filters'),

      callTypeSel: document.getElementById('filter-calltype'),
      statusSel: document.getElementById('filter-status'),

      usersBtn: document.getElementById('filter-users-btn'),
      usersPanel: document.getElementById('filter-users-panel'),
      usersSearch: document.getElementById('filter-users-search'),
      usersList: document.getElementById('filter-users-list'),
      usersClearBtn: document.getElementById('filter-users-clear'),
      usersDoneBtn: document.getElementById('filter-users-done'),
      usersAllCheck: document.getElementById('filter-users-all')
    };
  }

  function setUiLoadingState(isLoading) {
    const els = getFilterEls();

    [
      els.collaboratorSel,
      els.periodSel,
      els.fromInput,
      els.toInput,
      els.applyBtn,

      els.callTypeSel,
      els.statusSel,
      els.usersBtn
    ].forEach(el => {
      if (el) el.disabled = !!isLoading;
    });
  }

  function cancelAll() {
    try {
      if (App.state.telefoniaJobs?.data) App.state.telefoniaJobs.data.canceled = true;
      if (App.state.telefoniaJobs?.collab) App.state.telefoniaJobs.collab.canceled = true;
    } catch (e) {}

    setUiLoadingState(false);

    log('[TelefoniaModule] cancelAll -> jobs cancelados e UI destravada');
  }

  function renderFilters(container, viewId) {
    const isCommercial = (viewId === 'analise_comercial');

    container.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">

        ${isCommercial ? `
          <div style="min-width:320px; position:relative;">
            <label>Colaborador:</label><br>

            <button id="filter-users-btn" type="button"
              style="width:100%; text-align:left; padding:4px 6px; border:1px solid #ccc; border-radius:3px; background:#fff;">
              Carregando...
            </button>

            <div id="filter-users-panel"
              style="display:none; position:absolute; z-index:9999; top:54px; left:0; width:100%;
                    background:#fff; border:1px solid #ccc; border-radius:4px; box-shadow:0 2px 10px rgba(0,0,0,.12);
                    padding:8px; box-sizing:border-box;">

              <input id="filter-users-search" type="text" placeholder="Buscar..."
                style="width:100%; box-sizing:border-box; margin-bottom:6px; padding:4px 6px;" />

              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                <input id="filter-users-all" type="checkbox">
                <label for="filter-users-all" style="cursor:pointer;"><strong>Todos</strong></label>
              </div>

              <div id="filter-users-list"
                style="max-height:180px; overflow:auto; border:1px solid #eee; padding:6px; border-radius:3px;">
                <div class="placeholder">Carregando...</div>
              </div>

              <div style="display:flex; justify-content:space-between; margin-top:8px;">
                <button id="filter-users-clear" type="button">Limpar</button>
                <button id="filter-users-done" type="button">OK</button>
              </div>
            </div>
          </div>

          <div>
            <label>Tipo de ligação:</label><br>
            <select id="filter-calltype">
              <option value="none" selected>Todas</option>
              <option value="inbound">Recebidas</option>
              <option value="outbound">Realizadas</option>
            </select>
          </div>

          <div>
            <label>Status:</label><br>
            <select id="filter-status">
              <option value="all" selected>Todos</option>
              <option value="REUNIÃO AGENDADA">REUNIÃO AGENDADA</option>
              <option value="FALEI COM SECRETÁRIA">FALEI COM SECRETÁRIA</option>
              <option value="FOLLOW-UP">FOLLOW-UP</option>
              <option value="RETORNO POR E-MAIL">RETORNO POR E-MAIL</option>
              <option value="NÃO TEM INTERESSE">NÃO TEM INTERESSE</option>
              <option value="NÃO FAZ LOCAÇÃO">NÃO FAZ LOCAÇÃO</option>
              <option value="CAIXA POSTAL">CAIXA POSTAL</option>
              <option value="CHAMADA OCUPADA">CHAMADA OCUPADA</option>
              <option value="DESLIGOU">DESLIGOU</option>
              <option value="CHAMADA PERDIDA">CHAMADA PERDIDA</option>
              <option value="NÚMERO INCORRETO">NÚMERO INCORRETO</option>
              <option value="SEM_STATUS">Sem status</option>
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
            <option value="yesterday">Ontem</option>
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
      wireCommercialUsersUI();
      loadCollaboratorsForCommercial().catch(e => log('[TelefoniaModule] erro load comercial', e));
    } else {
      loadCollaboratorsIntoSelect().catch(e => log('[TelefoniaModule] erro load colaboradores', e));
    }
  }

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
      sel.innerHTML = `<option value="all" selected>Todos</option>`;
    } finally {
      if (!stillValid()) return;
      const loadingOpt = sel.querySelector('option[value="_loading"]');
      if (loadingOpt) loadingOpt.remove();
    }
  }

  function wireCommercialUsersUI() {
    const els = getFilterEls();
    const btn = els.usersBtn;
    const panel = els.usersPanel;
    const search = els.usersSearch;
    const list = els.usersList;
    const clearBtn = els.usersClearBtn;
    const doneBtn = els.usersDoneBtn;
    const allCheck = els.usersAllCheck;

    if (!btn || !panel || !search || !list || !clearBtn || !doneBtn || !allCheck) return;

    function getAllUserIds() {
      return (App.state.telefoniaCommercial.usersCache || []).map(u => String(u.ID));
    }

    function isAllSelected() {
      const allIds = getAllUserIds();
      if (!allIds.length) return false;
      const selected = App.state.telefoniaCommercial.selectedUserIds;
      return allIds.every(id => selected.has(id));
    }

    function updateBtnLabel() {
      const selected = App.state.telefoniaCommercial.selectedUserIds;
      const allIds = getAllUserIds();

      if (!allIds.length) {
        btn.textContent = 'Nenhum colaborador';
        return;
      }

      if (selected.size === 0 || isAllSelected()) {
        btn.textContent = 'Todos';
        return;
      }

      btn.textContent = `${selected.size} selecionado(s)`;
    }

    function syncAllCheckbox() {
      allCheck.checked = isAllSelected();
    }

    function syncChecksFromState() {
      const selected = App.state.telefoniaCommercial.selectedUserIds;

      panel.querySelectorAll('input[type="checkbox"][data-user-check="1"]').forEach(ch => {
        const id = String(ch.value);
        ch.checked = selected.has(id);
      });

      syncAllCheckbox();
      updateBtnLabel();
    }

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();

      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      if (!open) search.focus();
    });

    document.addEventListener('click', function () {
      panel.style.display = 'none';
    });

    panel.addEventListener('click', function (ev) {
      ev.stopPropagation();
    });

    search.addEventListener('input', function () {
      const q = (this.value || '').toLowerCase();
      const items = panel.querySelectorAll('[data-user-item="1"]');
      items.forEach(it => {
        const name = (it.getAttribute('data-name') || '').toLowerCase();
        it.style.display = name.includes(q) ? '' : 'none';
      });
    });

    allCheck.addEventListener('change', function () {
      const selected = App.state.telefoniaCommercial.selectedUserIds;
      const allIds = getAllUserIds();

      if (this.checked) {
        selected.clear();
        allIds.forEach(id => selected.add(id));
      } else {
        selected.clear();
      }

      syncChecksFromState();
    });

    clearBtn.addEventListener('click', function () {
      App.state.telefoniaCommercial.selectedUserIds.clear();
      syncChecksFromState();
    });

    doneBtn.addEventListener('click', function () {
      panel.style.display = 'none';
      updateBtnLabel();
    });

    updateBtnLabel();
  }

  async function loadCollaboratorsForCommercial() {
    const job = startNewCollabJob();
    const els = getFilterEls();
    if (!els.usersList || !els.usersBtn) return;

    const token = String(job.id);
    els.usersList.dataset.loadToken = token;

    function stillValid() {
      const cur = document.getElementById('filter-users-list');
      return cur && cur.dataset.loadToken === token;
    }

    els.usersBtn.textContent = 'Carregando...';
    els.usersList.innerHTML = `<div class="placeholder">Carregando...</div>`;

    try {
      const users = await Promise.race([
        Service.getActiveCollaborators(job),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_COLLAB')), 20000))
      ]);

      if (job.canceled || !stillValid()) return;

      App.state.telefoniaCommercial.usersCache = users || [];

      const selected = App.state.telefoniaCommercial.selectedUserIds;
      const allIds = (users || []).map(u => String(u.ID));

      if (selected.size === 0 && allIds.length) {
        allIds.forEach(id => selected.add(id));
      } else {
        const valid = new Set(allIds);
        Array.from(selected).forEach(id => { if (!valid.has(id)) selected.delete(id); });
      }

      let html = '';
      (users || []).forEach(u => {
        const id = String(u.ID);
        const name = u.NAME || id;
        const checked = selected.has(id) ? 'checked' : '';
        html += `
          <label data-user-item="1" data-name="${escapeHtml(name)}"
                 style="display:flex; gap:8px; align-items:center; padding:2px 0;">
            <input data-user-check="1" type="checkbox" value="${escapeHtml(id)}" ${checked}>
            <span>${escapeHtml(name)}</span>
          </label>
        `;
      });

      els.usersList.innerHTML = html || `<div class="placeholder">Nenhum colaborador ativo.</div>`;

      els.usersList.querySelectorAll('input[type="checkbox"][data-user-check="1"]').forEach(ch => {
        ch.addEventListener('change', function () {
          const id = String(this.value);
          if (this.checked) selected.add(id);
          else selected.delete(id);

          const allCheck = document.getElementById('filter-users-all');
          const btn = document.getElementById('filter-users-btn');

          const allIdsNow = (App.state.telefoniaCommercial.usersCache || []).map(u => String(u.ID));
          const allSelectedNow = allIdsNow.length && allIdsNow.every(x => selected.has(x));

          if (allCheck) allCheck.checked = allSelectedNow;

          if (btn) {
            if (selected.size === 0 || allSelectedNow) btn.textContent = 'Todos';
            else btn.textContent = `${selected.size} selecionado(s)`;
          }
        });
      });

      const allCheck = document.getElementById('filter-users-all');
      const allSelectedNow = allIds.length && allIds.every(x => selected.has(x));
      if (allCheck) allCheck.checked = allSelectedNow;

      els.usersBtn.textContent = allSelectedNow || selected.size === 0 ? 'Todos' : `${selected.size} selecionado(s)`;

    } catch (e) {
      if (!stillValid()) return;
      els.usersBtn.textContent = 'Todos';
      els.usersList.innerHTML = `<div class="placeholder">Falha ao carregar colaboradores.</div>`;
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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

    } else if (period === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);

      const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0,0,0);
      const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23,59,59);
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

  function getCommercialFiltersFromUI() {
    const els = getFilterEls();
    const callType = els.callTypeSel ? els.callTypeSel.value : 'none';

    const users = App.state.telefoniaCommercial.usersCache || [];
    const allIds = users.map(u => String(u.ID));
    const selectedSet = App.state.telefoniaCommercial.selectedUserIds || new Set();
    const selected = Array.from(selectedSet);

    const allSelected = allIds.length && allIds.every(id => selectedSet.has(id));

    let collaboratorIds = null;
    if (selected.length > 0 && !allSelected) collaboratorIds = selected;
    else collaboratorIds = null;

    const status = els.statusSel ? els.statusSel.value : "all";

    return { callType, collaboratorIds, status };
  }

  async function loadAndRender(viewId) {
    const job = startNewDataJob();
    App.state.activeViewId = viewId;

    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    const period = computeDateRangeFromUI();
    if (period && period.error) {
      BaseDash.renderError(`Filtro inválido: ${period.error}`);
      return;
    }

    setUiLoadingState(true);
    BaseDash.showLoading(true, 'Carregando dados de telefonia...');

    await nextPaint();

    try {
      let data;
      let filters = null;

      if (viewId === 'analise_comercial') {
        const commercial = getCommercialFiltersFromUI();

        filters = {
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
          callType: commercial.callType,
          collaboratorIds: commercial.collaboratorIds,
          status: commercial.status,
          __userRefresh: Date.now()
        };

        log('[TelefoniaModule] loadAndRender COMERCIAL', { ...filters, jobId: job.id });
        data = await Service.fetchAnaliseComercial(filters, job);

      } else {
        const collaboratorId = getCollaboratorFromUI();
        filters = { collaboratorId, dateFrom: period.dateFrom, dateTo: period.dateTo };

        log('[TelefoniaModule] loadAndRender', { viewId, ...filters, jobId: job.id });

        if (viewId === 'overview') data = await Service.fetchOverview(filters, job);
        else if (viewId === 'chamadas_recebidas') data = await Service.fetchChamadasRecebidas(filters, job);
        else if (viewId === 'chamadas_realizadas') data = await Service.fetchChamadasRealizadas(filters, job);
        else data = await Service.fetchOverview(filters, job);
      }

      if (job.canceled) return;

      const dash = Dashboards[viewId] || Dashboards.overview;
      if (!dash || typeof dash.render !== 'function') {
        BaseDash.renderError(`Dashboard "${viewId}" não carregado. Verifique o import do script no app.html.`);
        return;
      }

      dash.render(data, filters);

      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      log('[TelefoniaModule] render OK (' + Math.round(t1 - t0) + 'ms)', { viewId, jobId: job.id });

    } catch (e) {
      if (job.canceled) return;

      const msg = (e && e.message) ? e.message : String(e || '');
      log('[TelefoniaModule] ERRO', msg);

      if (msg === 'TIMEOUT') {
        BaseDash.renderError('Timeout ao carregar dados. Tente um período menor ou um colaborador/seleção mais específica.');
      } else {
        BaseDash.renderError('Erro ao carregar dados de telefonia. ' + msg);
      }
    } finally {
      if (isCurrentDataJob(job)) {
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
    loadAndRender,
    cancelAll
  };
})(window);