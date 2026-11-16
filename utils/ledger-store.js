// 唯一数据访问门面。页面只调本文件，接口统一 async + { data, error }。
//
// 两种存储方式，用户可在「我的」页手动切换，选择会记在本机：
//   cloud = 云端共享账本，两个人打开是同一本账（默认）
//   local = 本机账本，只存在当前手机
//
// 云端不可用（组件没构建、域名被拦）时不硬切，只把原因放进 notice 交给页面提示；
// 运行中云端请求失败同样自动降级到本机，避免整个小程序被一个网络错误卡死。
const shared = require('./ledger-store.cloud');
const local = require('./ledger-store.local');
const cloud = require('./cloud');
const { buildDashboard } = require('./dashboard');

const cloudAvailable = !!cloud.cloudAvailable;

const MODE_KEY = 'youshu_storage_mode';
const MODE_CLOUD = 'cloud';
const MODE_LOCAL = 'local';

// 微信在 request 域名未授权时给的 errMsg 形如 request:fail url not in domain list；
// 断网、超时也算同类，本次运行内继续走云端只会让每个页面都弹同一个错。
const OFFLINE_RE = /url not in domain|fail url not in|request:fail|net::err|timeout/i;

const OFFLINE_NOTICE = '云端连接失败（域名未加入小程序 request 白名单），已切换为本机账本，两台手机不会同步。';

const METHODS = [
    'init', 'getMonthOverview', 'getRecentRecords', 'getStats',
    'getAccounts', 'createAccount', 'updateAccount', 'removeAccount',
    'getCategories', 'createCategory', 'removeCategory',
    'getRecord', 'createRecord', 'updateRecord', 'removeRecord',
    'getBudgets', 'setBudget', 'removeBudget',
    'getRecurring', 'setRecurring', 'toggleRecurring', 'removeRecurring',
    'getProfile', 'setProfile',
    'exportCsv', 'importCsv', 'resetAll',
];

let activeMode = 'local';
let notice = '';

function fail(code, message) {
    return { data: null, error: { code, message } };
}

// 存储接口在纯 Node 测试里可能不存在，取不到就当作「没选过」。
function storage() {
    return typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function' ? wx : null;
}

function readSavedMode() {
    const store = storage();
    if (!store) return '';
    try {
        const value = store.getStorageSync(MODE_KEY);
        return value === MODE_LOCAL || value === MODE_CLOUD ? value : '';
    } catch (e) {
        return '';
    }
}

function saveMode(mode) {
    const store = storage();
    if (!store) return;
    try {
        store.setStorageSync(MODE_KEY, mode);
    } catch (e) {
        // 存不下最多影响下次启动的默认值，不影响本次使用。
    }
}

function cloudUnavailableReason() {
    if (cloudAvailable) return '';
    const detail = cloud.cloudError && cloud.cloudError.message ? String(cloud.cloudError.message) : '';
    if (/cannot find module/i.test(detail)) {
        return '云服务组件还没构建（缺少 miniprogram_npm），需要先在开发者工具执行「工具 → 构建 npm」。';
    }
    return '云服务组件未加载' + (detail ? '：' + detail : '') + '。';
}

// 启动时定模式：用户明确选过本机就尊重；否则云端可用就走云端。
function bootstrapMode() {
    const saved = readSavedMode();
    if (saved === MODE_LOCAL) {
        activeMode = 'local';
        notice = '';
        return;
    }
    if (cloudAvailable) {
        activeMode = 'shared';
        notice = '';
        return;
    }
    activeMode = 'local';
    notice = cloudUnavailableReason() + '当前只能使用本机账本。';
}

bootstrapMode();

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
    // 本机账本首次使用要先铺好默认账户与分类，否则读出来是空账。
    await local.init();
    // 故意不写入偏好：下次启动仍按用户选的云端重试。
    console.warn('[ledger-store] 云端不可达，已退回本机账本：' + (error && (error.message || error.code)));
}

async function call(name, args) {
    const result = await currentImpl()[name].apply(null, args);
    if (!result || !result.error || activeMode !== 'shared') return result;
    if (!isOfflineError(result.error)) return result;
    await degradeToLocal(result.error);
    return local[name].apply(null, args);
}

// 手动切换存储方式。切云端必须先探测通，探不通就不改状态，让页面提示只能本机。
async function setMode(target) {
    if (target !== MODE_CLOUD && target !== MODE_LOCAL) {
        return fail('INVALID_MODE', '未知的存储方式');
    }

    if (activeMode === (target === MODE_CLOUD ? 'shared' : 'local')) {
        return { data: { mode: target, changed: false }, error: null };
    }

    if (target === MODE_LOCAL) {
        const ready = await local.init();
        if (ready.error) return ready;
        activeMode = 'local';
        notice = '';
        saveMode(MODE_LOCAL);
        return { data: { mode: MODE_LOCAL }, error: null };
    }

    if (!cloudAvailable) {
        return fail('CLOUD_UNAVAILABLE', cloudUnavailableReason() + '只能继续使用本机账本。');
    }

    const probe = await shared.init();
    if (probe.error) {
        const reason = isOfflineError(probe.error)
            ? '云端请求被微信拦截，多半是 mp-api.app.workbuddy.host 没加入小程序的 request 合法域名'
            : (probe.error.message || '未知错误');
        return fail(probe.error.code || 'CLOUD_UNREACHABLE', reason + '，只能继续使用本机账本。');
    }

    activeMode = 'shared';
    notice = '';
    saveMode(MODE_CLOUD);
    return { data: { mode: MODE_CLOUD }, error: null };
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
    // 内部叫 shared / local，界面上叫 cloud / local，这里统一转一次。
    get storageMode() {
        return activeMode;
    },
    get mode() {
        return activeMode === 'shared' ? MODE_CLOUD : MODE_LOCAL;
    },
    get notice() {
        return notice;
    },
    get cloudAvailable() {
        return cloudAvailable;
    },
    setMode,
    getDashboard,
};

METHODS.forEach((name) => {
    facade[name] = function () {
        return call(name, Array.prototype.slice.call(arguments));
    };
});

module.exports = facade;
