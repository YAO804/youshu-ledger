// 唯一数据访问门面。页面只调本文件，接口统一 async + { data, error }。
// 没有账号体系：云服务可用时两个人共用一本云端账本。
// 云组件未加载、或云端请求被微信拦截（域名未加入小程序 request 白名单）时，
// 自动退回本机账本并记下提示语，避免一个网络错误把整个小程序卡死。
const shared = require('./ledger-store.cloud');
const local = require('./ledger-store.local');
const { cloudAvailable } = require('./cloud');
const { buildDashboard } = require('./dashboard');

// 微信在 request 域名未授权时给的 errMsg 形如：
//   request:fail url not in domain list
// 断网、超时也算同类：本次运行内继续走云端，只会让每个页面都弹同一个错。
const OFFLINE_RE = /url not in domain|fail url not in|request:fail|net::err|timeout/i;

const MISSING_SDK_NOTICE = '云服务组件未加载，账目暂存在本机，两台手机不会同步。';
const OFFLINE_NOTICE = '云端连接失败（域名未加入小程序 request 白名单），已切换为本机账本，两台手机不会同步。';

let activeMode = cloudAvailable ? 'shared' : 'local';
let notice = cloudAvailable ? '' : MISSING_SDK_NOTICE;

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

function currentImpl() {
    return activeMode === 'shared' ? shared : local;
}

function isOfflineError(error) {
    if (!error) return false;
    return OFFLINE_RE.test(String(error.message || error.errMsg || error.code || ''));
}

async function degradeToLocal(error) {
    if (activeMode !== 'shared') return;
    activeMode = 'local';
    notice = OFFLINE_NOTICE;
    // 本机账本首次使用时要先铺好默认账户与分类，否则读出来是空账。
    await local.init();
    console.warn('[ledger-store] 云端不可达，已退回本机账本：' + (error && (error.message || error.code)));
}

async function call(name, args) {
    const result = await currentImpl()[name].apply(null, args);
    if (!result || !result.error || activeMode !== 'shared') return result;
    if (!isOfflineError(result.error)) return result;
    await degradeToLocal(result.error);
    return local[name].apply(null, args);
}

// 首页概览：一次聚合月汇总、统计与账户余额，页面只负责渲染。
async function getDashboard(month) {
    const modeBefore = activeMode;
    const load = () => Promise.all([
        call('getMonthOverview', [month]),
        call('getStats', [month]),
        call('getAccounts', []),
    ]);

    let results = await load();
    // 中途退回了本机账本，三份数据可能一半来自云端一半来自本机，重取一次保证同源。
    if (activeMode !== modeBefore) results = await load();

    const broken = results.find((r) => r && r.error);
    if (broken) return broken;
    return {
        data: buildDashboard(results[0].data, results[1].data, results[2].data, month),
        error: null,
    };
}

const facade = {
    get storageMode() {
        return activeMode;
    },
    // 为空表示没有降级，页面可以直接把这句话当成提示条内容。
    get notice() {
        return notice;
    },
    getDashboard,
};

METHODS.forEach((name) => {
    facade[name] = function () {
        return call(name, Array.prototype.slice.call(arguments));
    };
});

module.exports = facade;
