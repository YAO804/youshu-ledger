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

// 登录后把本地试用账目搬到云端。任一步失败都保留本地数据，绝不先清后传。
async function migrateLocalToCloud() {
    modePromise = null;
    const mode = await getMode();
    if (mode !== MODE_CLOUD) {
        return { data: null, error: { code: 'NOT_CLOUD_MODE', message: '请先登录后再同步' } };
    }

    const state = local.snapshot();
    const records = state && Array.isArray(state.records) ? state.records : [];
    if (records.length === 0) return { data: { migrated: 0, skipped: 0, extras: 0 }, error: null };

    const initRes = await cloudStore.init();
    if (initRes.error) return initRes;

    const cloudAccounts = await cloudStore.getAccounts();
    if (cloudAccounts.error) return cloudAccounts;
    const cloudCategories = await cloudStore.getCategories();
    if (cloudCategories.error) return cloudCategories;

    // 云端种子之外的自定义账户 / 分类先补齐，CSV 才能按名称匹配
    for (const item of state.accounts || []) {
        if (cloudAccounts.data.some((x) => x.name === item.name)) continue;
        const res = await cloudStore.createAccount({
            name: item.name, type: item.type, initialBalance: Number(item.initialBalance) || 0,
        });
        if (res.error && res.error.code !== 'ALREADY_EXISTS') return res;
    }
    for (const item of state.categories || []) {
        if (cloudCategories.data.some((x) => x.name === item.name && x.type === item.type)) continue;
        const res = await cloudStore.createCategory({ name: item.name, type: item.type });
        if (res.error && res.error.code !== 'ALREADY_EXISTS') return res;
    }

    // 账目走 CSV：已有按名称映射账户/分类和 source_key 去重能力
    const exported = await local.exportCsv();
    if (exported.error) return exported;
    const imported = await cloudStore.importCsv(exported.data.csv);
    if (imported.error) return imported;

    // 预算 / 周期规则里的本地 id 要换成云端 id，映射不到的跳过
    const finalAccounts = await cloudStore.getAccounts();
    const finalCategories = await cloudStore.getCategories();
    const accountMap = {};
    (state.accounts || []).forEach((item) => {
        const hit = finalAccounts.data && finalAccounts.data.find((x) => x.name === item.name);
        if (hit) accountMap[item.id] = hit.id;
    });
    const categoryMap = {};
    (state.categories || []).forEach((item) => {
        const hit = finalCategories.data && finalCategories.data.find((x) => x.name === item.name && x.type === item.type);
        if (hit) categoryMap[item.id] = hit.id;
    });

    let extras = 0;
    if (state.profile && state.profile.nickname) {
        const res = await cloudStore.setProfile({ nickname: state.profile.nickname });
        if (!res.error) extras += 1;
    }
    for (const item of state.budgets || []) {
        const res = await cloudStore.setBudget({
            month: item.month,
            categoryId: categoryMap[item.categoryId] || null,
            amountCents: item.amount,
        });
        if (!res.error) extras += 1;
    }
    for (const item of state.recurringRules || []) {
        const categoryId = categoryMap[item.categoryId];
        const accountId = accountMap[item.accountId];
        if (!categoryId || !accountId) continue;
        const res = await cloudStore.setRecurring({
            type: item.type, amountCents: item.amount,
            categoryId, accountId, day: item.day, note: item.note,
            enabled: item.enabled,
        });
        if (!res.error) extras += 1;
    }

    if (!local.clearLocal()) {
        return {
            data: null,
            error: { code: 'LOCAL_CLEAR_FAILED', message: '账目已上传，但本地数据未清除，请在「我的」里手动清空' },
        };
    }
    return {
        data: { migrated: imported.data.imported, skipped: imported.data.skipped, extras },
        error: null,
    };
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
    migrateLocalToCloud,
    MODE_LOCAL,
    MODE_CLOUD,
};

METHODS.forEach((name) => {
    facade[name] = function () {
        return call(name, Array.prototype.slice.call(arguments));
    };
});

module.exports = facade;
