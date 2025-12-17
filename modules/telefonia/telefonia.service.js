(function (global) {
    const App = global.App = global.App || {};
    const log = App.log || function(){};

    const TelefoniaService = {
        /**
         * Filtro futuro:
         * { dateFrom, dateTo, userId, direction, statusDescription... }
         */
        async fetchOverview(filters) {
            log('[TelefoniaService] fetchOverview', filters);
            // TODO: aqui depois vamos chamar crm.activity.list etc.
            // Por enquanto devolve dados fake só pra testar o layout.
            return {
                totalCalls: 120,
                answeredCalls: 80,
                missedCalls: 40,
                callsByUser: [
                    { user: 'Agente 1', total: 50, answered: 35 },
                    { user: 'Agente 2', total: 70, answered: 45 }
                ]
            };
        },

        async fetchChamadasRealizadas(filters) {
            log('[TelefoniaService] fetchChamadasRealizadas', filters);
            return {
                total: 200,
                // etc...
            };
        },

        async fetchChamadasAtendidas(filters) {
            log('[TelefoniaService] fetchChamadasAtendidas', filters);
            return {
                total: 140,
                // etc...
            };
        }
    };

    App.modules = App.modules || {};
    App.modules.TelefoniaService = TelefoniaService;
})(window);