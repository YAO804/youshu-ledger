// 数据层门面：页面只调本文件，接口统一 async + { data, error }。
// 已登录且云服务可用 → 云端实现；未登录 / 云服务组件未加载 → 本地实现（免注册直接试用）。
// 换存储方案只改这里的分发，页面代码不动。

const local = require('./ledger-store.local');
const cloudStore = require('./ledger-store.cloud');
const { cloud, cloudAvailable } = require('./cloud');

const MODE_LOCAL = 'local';
const MODE_CLOUD = 'cloud';

let modePromise = null;

async function detectMode() {
    if (!cloudAvailable) return MODE_LOCAL;
    try {
        const { data: session, error } = await cloud.auth.getSession();
        return !error && session ? MODE_CLOUD : MODE_LOCAL;
    } catch (e) {
        return MODE_LOCAL;
    }
}

function getMode() {
    if (!modePromise) modePromise = detectMode();
    return modePromise;
}

// 登录 / 退出登录后必须调用，否则模式判定会一直用旧结果。
function resetMode() {
    modePromise = null;
}

function call(name, args) {
    return getMode().then((mode) => {
        const impl = mode === MODE_CLOUD ? cloudStore : local;
        return impl[name].apply(null, args);
    });
}

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

const facade = {
    getMode,
    resetMode,
    MODE_LOCAL,
    MODE_CLOUD,
};

METHODS.forEach((name) => {
    facade[name] = function () {
        return call(name, Array.prototype.slice.call(arguments));
    };
});

module.exports = facade;
