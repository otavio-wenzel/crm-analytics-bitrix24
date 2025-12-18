(function (global) {
    const App = global.App = global.App || {};
    const log = App.log || function(){};

    App.state  = App.state  || {};
    App.modules = App.modules || {};

    // Status que você usa no outro app (DESCRIPTION)
    const KNOWN_STATUSES = [
        'REUNIÃO AGENDADA',
        'FALEI COM SECRETÁRIA',
        'FOLLOW-UP',
        'RETORNO POR E-MAIL',
        'NÃO TEM INTERESSE',
        'NÃO FAZ LOCAÇÃO',
        'CAIXA POSTAL'
    ];

    function classifyStatus(description) {
        const desc = (description || '').toUpperCase();
        if (!desc) return 'SEM CLASSIFICAÇÃO';

        for (const s of KNOWN_STATUSES) {
            if (desc === s || desc.includes(s)) {
                return s;
            }
        }
        return 'OUTROS';
    }

    // Calcula período baseado no filtro "period"
    function resolveDateRange(filters) {
        const period = (filters && filters.period) || '30d';
        let from, to;

        const now = new Date();
        to = now;

        if (period === 'today') {
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        } else if (period === '7d') {
            from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (period === '30d') {
            from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        } else if (period === 'custom' && filters.dateFrom && filters.dateTo) {
            from = new Date(filters.dateFrom);
            to   = new Date(filters.dateTo);
        } else {
            from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        return {
            from: from.toISOString(),
            to:   to.toISOString()
        };
    }

    // Envolve crm.activity.list em uma Promise e trata paginação
    function fetchActivities(params) {
        return new Promise((resolve, reject) => {
            let all = [];

            BX24.callMethod(
                'crm.activity.list',
                params,
                function (result) {
                    try {
                        if (!result) {
                            reject(new Error('crm.activity.list retornou result vazio'));
                            return;
                        }
                        if (typeof result.error === 'function' && result.error()) {
                            reject(result.error());
                            return;
                        }

                        const data = (typeof result.data === 'function') ? (result.data() || []) : [];
                        all = all.concat(data);

                        if (typeof result.more === 'function' && result.more()) {
                            result.next();
                        } else {
                            resolve(all);
                        }
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }

    // --------- AGREGADORES ---------

    function aggregateOverview(activities) {
        const totalCalls    = activities.length;
        let answeredCalls   = 0;
        let missedCalls     = 0;

        const callsByUserMap   = {};
        const callsByStatusMap = {};

        activities.forEach(a => {
            const completed = String(a.COMPLETED || '').toUpperCase() === 'Y';
            if (completed) answeredCalls++;
            else           missedCalls++;

            const respId = a.RESPONSIBLE_ID || 'SEM_RESP';
            if (!callsByUserMap[respId]) {
                callsByUserMap[respId] = {
                    userId: respId,
                    total: 0,
                    answered: 0,
                    missed: 0
                };
            }
            callsByUserMap[respId].total++;
            if (completed) {
                callsByUserMap[respId].answered++;
            } else {
                callsByUserMap[respId].missed++;
            }

            const statusName = classifyStatus(a.DESCRIPTION);
            if (!callsByStatusMap[statusName]) {
                callsByStatusMap[statusName] = { status: statusName, total: 0 };
            }
            callsByStatusMap[statusName].total++;
        });

        const callsByUser = Object.values(callsByUserMap);
        const callsByStatus = Object.values(callsByStatusMap);

        return {
            totalCalls,
            answeredCalls,
            missedCalls,
            callsByUser,
            callsByStatus,
            rawActivities: activities
        };
    }

    // --------- API DO SERVIÇO ---------

    const TelefoniaService = {
        /**
         * Visão geral: total, atendidas, perdidas, por usuário, por status.
         */
        async fetchOverview(filters) {
            const { from, to } = resolveDateRange(filters || {});
            log('[TelefoniaService] fetchOverview', { from, to, filters });

            const filter = {
                TYPE_ID: 2,                    // 2 = ligação
                '>=END_TIME': from,
                '<=END_TIME': to
            };

            if (filters && filters.userId) {
                filter.RESPONSIBLE_ID = filters.userId;
            }
            if (filters && filters.direction) {
                // 1 = saída, 2 = entrada
                filter.DIRECTION = filters.direction;
            }

            const params = {
                order: { END_TIME: 'DESC' },
                filter,
                select: [
                    'ID',
                    'SUBJECT',
                    'START_TIME',
                    'END_TIME',
                    'RESPONSIBLE_ID',
                    'COMPLETED',
                    'DESCRIPTION',
                    'DIRECTION'
                ]
            };

            const activities = await fetchActivities(params);
            log('[TelefoniaService] fetchOverview - atividades encontradas: ' + activities.length);
            return aggregateOverview(activities);
        },

        /**
         * Chamadas realizadas (saída) – ainda em nível de contagem.
         */
        async fetchChamadasRealizadas(filters) {
            const merged = Object.assign({}, filters || {}, { direction: 1 });
            const overview = await this.fetchOverview(merged);
            return {
                total: overview.totalCalls,
                callsByUser: overview.callsByUser
            };
        },

        /**
         * Chamadas atendidas (saída + COMPLETED = Y).
         */
        async fetchChamadasAtendidas(filters) {
            const { from, to } = resolveDateRange(filters || {});
            log('[TelefoniaService] fetchChamadasAtendidas', { from, to, filters });

            const filter = {
                TYPE_ID: 2,
                DIRECTION: 1,
                COMPLETED: 'Y',
                '>=END_TIME': from,
                '<=END_TIME': to
            };
            if (filters && filters.userId) {
                filter.RESPONSIBLE_ID = filters.userId;
            }

            const params = {
                order: { END_TIME: 'DESC' },
                filter,
                select: [
                    'ID',
                    'SUBJECT',
                    'START_TIME',
                    'END_TIME',
                    'RESPONSIBLE_ID',
                    'COMPLETED',
                    'DESCRIPTION',
                    'DIRECTION'
                ]
            };

            const activities = await fetchActivities(params);
            const base = aggregateOverview(activities);

            return {
                total: activities.length,
                callsByUser: base.callsByUser
            };
        }
    };

    App.modules.TelefoniaService = TelefoniaService;
})(window);