// 唯一数据访问门面。页面只调本文件，接口统一 async + { data, error }。
// 没有账号体系：云服务可用时两个人共用一本云端账本；
// 云服务组件未加载时退回本机账本，保证记账功能始终可用。
const shared = require('./ledger-store.cloud');
const local = require('./ledger-store.local');
const { cloudAvailable } = require('./cloud');
const { buildDashboard } = require('./dashboard');

const impl = cloudAvailable ? shared : local;

const METHODS = [
    'init', 'getMonthOverview', 'getStats',
    'getAccounts', 'createAccount', 'updateAccount', 'removeAccount',
    'getCategories', 'createCategory', 'removeCategory',
    'getRecord', 'createRecord', 'updateRecord', 'removeRecord',
    'getBudgets', 'setBudget', 'removeBudget',
    'getRecurring', 'setRecurring', 'toggleRecurring', 'removeRecurring',
    'getProfile', 'setProfile',
    'exportCsv', 'importCsv', 'resetAll',
];

// 首页概览：一次聚合月汇总、统计与账户余额，页面只负责渲染。
async function getDashboard(month) {
    const results = await Promise.all([
        facade.getMonthOverview(month),
        facade.getStats(month),
        facade.getAccounts(),
    ]);
    const broken = results.find((r) => r && r.error);
    if (broken) return broken;
    return {
        data: buildDashboard(results[0].data, results[1].data, results[2].data, month),
        error: null,
    };
}

const facade = {
    storageMode: cloudAvailable ? 'shared' : 'local',
    getDashboard,
};

METHODS.forEach((name) => {
    facade[name] = function () {
        return impl[name].apply(null, Array.prototype.slice.call(arguments));
    };
});

module.exports = facade;
