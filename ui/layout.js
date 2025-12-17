(function (global) {
    const App = global.App = global.App || {};
    App.ui.refs = App.ui.refs || {};

    const refs = App.ui.refs;

    refs.appTitleEl        = document.getElementById('app-title');
    refs.headerUserInfoEl  = document.getElementById('header-user-info');
    refs.sidebarModuleBtns = document.querySelectorAll('.sidebar-item-module');
    refs.sidebarSubBtns    = document.querySelectorAll('.sidebar-subitem');
    refs.filtersBarEl      = document.getElementById('filters-bar');
    refs.dashboardContentEl= document.getElementById('dashboard-content');
})(window);