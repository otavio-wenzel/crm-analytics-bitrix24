# crm-analytics-bitrix24

# App de Dashboards (Bitrix24) — Módulo Telefonia

Aplicação web (front-end) executada dentro do ambiente Bitrix24 (BX24), organizada em módulos JavaScript anexados ao namespace global `App`. O foco atual é o **módulo de Telefonia**, que entrega dashboards com filtros, carregamento resiliente e otimizações (cache, chunking de período, concorrência controlada e cancelamento de jobs).

> **Nota de escopo (importante):**
> Este README documenta **com precisão** o que está presente e explícito nos arquivos compartilhados aqui (Telefonia).  
> Se existirem outros módulos no seu app além de Telefonia, inclua-os neste README adicionando seções equivalentes (ou me envie o `app.html`/router para eu completar 100%).

---

## Sumário

- [Visão geral](#visão-geral)
- [Funcionalidades principais](#funcionalidades-principais)
- [Arquitetura e organização](#arquitetura-e-organização)
- [Módulo Telefonia](#módulo-telefonia)
  - [Dashboards disponíveis](#dashboards-disponíveis)
  - [Filtros e comportamento](#filtros-e-comportamento)
  - [Fluxo de carregamento e cancelamento](#fluxo-de-carregamento-e-cancelamento)
  - [Chunking de período e resiliência a timeout](#chunking-de-período-e-resiliência-a-timeout)
  - [Cache unificado e revalidação leve](#cache-unificado-e-revalidação-leve)
  - [Concorrência controlada](#concorrência-controlada)
  - [Enriquecimento de nomes de usuários](#enriquecimento-de-nomes-de-usuários)
- [Configuração e dependências](#configuração-e-dependências)
- [Troubleshooting](#troubleshooting)
- [Boas práticas e extensão](#boas-práticas-e-extensão)
- [Roadmap curto](#roadmap-curto)

---

## Visão geral

O app expõe dashboards que consultam dados externos (telefonia e CRM) e agregam métricas para visualização. A implementação segue um padrão simples e pragmático:

- Namespace global `App` (ex.: `App.modules`, `App.state`, `App.ui.refs`)
- Módulos em IIFE: `(function(global){ ... })(window);`
- Providers desacoplados para fontes de dados:
  - `TelefoniaProviderVox` (chamadas de telefonia)
  - `TelefoniaProviderCRM` (atividades/status vinculados a chamadas)
- Dashboards renderizados por módulos específicos + `TelefoniaDashboardBase` para loading/erro

---

## Funcionalidades principais

- **Dashboards de Telefonia**:
  - Visão geral
  - Chamadas recebidas
  - Chamadas realizadas
  - Análise comercial (com status e seleção múltipla de colaboradores)

- **Filtros**:
  - Colaborador (single select nos dashboards simples; multi select na análise comercial)
  - Período (presets + personalizado)
  - Tipo de ligação (na análise comercial)
  - Status (na análise comercial)

- **Performance e resiliência**:
  - Chunking dinâmico por período (evita ranges gigantes e dezenas/centenas de chamadas)
  - Fallback automático em caso de timeout, com split recursivo do intervalo
  - Cache unificado de chamadas reaproveitado por todas as views
  - Cache de índice de atividades (dispositions) no comercial
  - Concorrência controlada (pool) para evitar rate-limit/engasgos em APIs
  - Cancelamento de jobs ao trocar de view/módulo (evita “travamento em loading”)

---

## Arquitetura e organização

### Padrões base

- **Módulos**: registrados em `App.modules.<NomeModulo>`
- **Estado**: centralizado em `App.state` (ex.: `App.state.telefoniaJobs`, `App.state.telefoniaCommercial`)
- **UI refs**: `App.ui.refs` (ex.: sidebar)
- **Logs**: `App.log` quando disponível

### Arquivos documentados (Telefonia)

- `telefonia.module.js`
  - UI de filtros, leitura de inputs
  - Acionamento de carregamento por view
  - Controle de jobs (data/collab)
  - Loading state sem bloquear navegação
  - Cancelamento “duro” (troca de view/módulo)

- `telefonia.service.js`
  - Consulta de calls via provider de telefonia (Vox)
  - Chunking + fallback de timeout
  - Cache unificado de calls + actIndex
  - Lógica de análise comercial (match de disposition em janela de tempo)
  - Concorrência controlada (pool)

- `telefonia.filter.period.js`
  - Geração de ranges (chunks) com base em `dateFrom/dateTo`
  - Chunk size adaptativo conforme total de dias
  - Aplicação do range no filtro (`>=CALL_START_DATE` / `<=CALL_START_DATE`)

- `telefonia.service.core.js` (Core)
  - Agregações: overview / inbound / outbound
  - Enriquecimento de nomes via `BX24.callMethod('user.get')` com concorrência

---

## Módulo Telefonia

### Dashboards disponíveis

O módulo registra as seguintes views (IDs):

- `overview` → `TelefoniaDashboardOverview`
- `chamadas_recebidas` → `TelefoniaDashboardInbound`
- `chamadas_realizadas` → `TelefoniaDashboardOutbound`
- `analise_comercial` → `TelefoniaDashboardCommercial`

Todos utilizam `TelefoniaDashboardBase` para:
- loading (ex.: “Carregando dados de telefonia...”)
- renderização de erro amigável

---

### Filtros e comportamento

#### Período (presets + personalizado)

No UI, o filtro de período é um `<select id="filter-period">` que gera `dateFrom/dateTo` no formato ISO local:

- Presets:
  - `today` (Hoje) → 00:00:00 até 23:59:59 do dia atual
  - `7d`, `30d`, `90d`, `180d`, `365d` → do início do dia de “hoje - (N-1)” até 23:59:59 de hoje
  - `custom` (Personalizado...) → baseado em `<input type="date">` (de/até)

> **Adicionar “Ontem”**  
> A opção “Ontem” deve ser adicionada ao UI (select) e ao cálculo do range no `computeDateRangeFromUI()`.  
> A mudança é local (somente UI/range), não mexe em cache, chunking ou provider, portanto não deve impactar desempenho.

#### Colaborador

- Dashboards simples: `filter-collaborator` (single select)
- Comercial: multi seleção com painel (“Todos”, busca, limpar, OK)

#### Tipo de ligação / Status (somente comercial)

- Tipo: `none` (todas), `inbound` (recebidas), `outbound` (realizadas)
- Status: lista de dispositions + `SEM_STATUS`

---

### Fluxo de carregamento e cancelamento

O módulo implementa **jobs** para evitar corrida de requests:

- `App.state.telefoniaJobs.data` e `App.state.telefoniaJobs.collab`
- Sempre que uma nova consulta começa:
  - o job anterior é marcado como `canceled = true`
  - o job novo recebe `id` incremental

Durante loading:
- filtros são desabilitados (mas **sidebar não é bloqueada**)
- `nextPaint()` garante 1 frame de render para mostrar “Carregando...”
- ao finalizar, a UI só é destravada se o job ainda é o atual (`isCurrentDataJob(job)`)

`cancelAll()`:
- cancela jobs (data/collab)
- destrava UI imediatamente
- é o gancho ideal para o router chamar ao trocar de módulo/view

---

### Chunking de período e resiliência a timeout

O filtro de período (`telefonia.filter.period.js`) gera ranges em dias inteiros:

- Sem “buracos” (00:00:00 → 23:59:59)
- Chunk size adaptativo:
  - escolhe `daysPerChunk` conforme total de dias
  - objetivo: evitar centenas de chunks e chamadas

No service (`telefonia.service.js`), cada chunk é buscado e, se houver **TIMEOUT**:
- divide o range ao meio (recursivo)
- mantém continuidade (sem lacunas)
- profundidade máxima para evitar loops infinitos

Também existem fallbacks:
- Se filtro com array de usuários falhar → refaz por usuário (perUser)
- Se inbound falhar → refaz com `CALL_TYPE=2` e `CALL_TYPE=3`

---

### Cache unificado e revalidação leve

Cache em memória no service:

- `__cache.calls`: cache de calls por chave estável (período + colaborador(es) + callType)
- `__cache.actIndex`: cache do índice de atividades (comercial)

TTL:
- `CACHE_TTL_MS = 5 minutos`

Revalidação leve:
- quando o usuário “aplica filtros” novamente (`__userRefresh`) **e** o range inclui “agora”
- consulta opcional `Provider.getLatestCall` (se existir)
- se detectar call nova (fingerprint mudou):
  - invalida `calls` e limpa `actIndex`

---

### Concorrência controlada

Para evitar rate-limit/engasgos em chamadas externas, existe um pool simples:

- `runPool(items, concurrency, workerFn, job)`

Aplicações:
- chunking no Vox: `VOX_CONCURRENCY` (baixo por segurança)
- CRM dispositions: `CRM_CONCURRENCY` (ex.: 2) para não disparar 7 chamadas simultâneas

---

### Enriquecimento de nomes de usuários

Em `telefonia.service.core.js`, `enrichWithUserNames()`:

- identifica IDs faltantes no cache `App.state.telefoniaCache.userNameMap`
- busca via `BX24.callMethod('user.get', { ID })`
- concorrência controlada (ex.: 5)
- aplica `userName` nas linhas agregadas

---

## Configuração e dependências

### Ambiente

- Execução dentro do Bitrix24 (disponibilidade de `BX24`)
- `TelefoniaProviderVox` deve expor:
  - `getCalls(filterObj, job, opts)`
  - `getActiveCollaborators(job)`
  - (opcional) `getLatestCall(filterObj, job, opts)`
- `TelefoniaProviderCRM` (para comercial) deve expor:
  - `getCallActivities(dateFrom, dateTo, responsibleIds, disposition, job)`

### Scripts/imports

Garanta que os scripts sejam carregados na ordem lógica:

1. `telefonia.filter.period.js`
2. filtros adicionais (collaborator/callType)
3. `telefonia.service.core.js`
4. providers (`TelefoniaProviderVox`, `TelefoniaProviderCRM`)
5. dashboards (`TelefoniaDashboardBase` + views)
6. `telefonia.service.js`
7. `telefonia.module.js`

> A ordem exata depende do seu `app.html`/loader.

---

## Troubleshooting

### 1) “Fica travado no carregamento”
- Verifique se o router chama `App.modules.telefonia.cancelAll()` ao sair do módulo/view.
- Confirme que `isCurrentDataJob(job)` está evitando destravar UI no job errado.

### 2) Timeout em períodos longos
- É esperado em ranges muito grandes. O fallback de split recursivo tenta recuperar.
- Sugestão operacional: orientar usuário a reduzir período ou filtrar por colaborador(es).

### 3) Comercial sem status / erro ProviderCRM
- Confirme que `TelefoniaProviderCRM` está carregado antes do service.
- Mensagem típica: `Provider CRM não carregado (TelefoniaProviderCRM). Verifique o import no app.html.`

### 4) Nomes de usuários não aparecem
- Verifique permissões do app para `user.get`.
- Verifique se `BX24` está disponível no contexto.

---

## Boas práticas e extensão

- Alterações no filtro de período devem ficar **restritas ao módulo (UI)** e/ou ao `TelefoniaFilterPeriod`.
- Evite aumentar concorrência sem medir impacto (pode piorar por rate-limit).
- Para novos dashboards:
  - crie agregador no `TelefoniaCore`
  - adicione método no `TelefoniaService`
  - registre no `Dashboards` em `telefonia.module.js`
  - implemente view render em `TelefoniaDashboard<...>`

---

## Roadmap curto

- [ ] Adicionar preset **“Ontem”** no filtro de período (UI + cálculo de range)
- [ ] (Opcional) Persistir seleção de filtros por view (localStorage)
- [ ] Telemetria simples de tempo por etapa (fetch calls / fetch CRM / render)
- [ ] Ajuste fino de chunk size para cenários extremos (ex.: > 2.000 dias)

---