// 回归测试：存储方式可以手动切换，且「切不过去」时必须明确拒绝并保持本机模式。
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const utilsDir = path.join(root, 'utils') + path.sep;
const storePath = path.join(root, 'utils/ledger-store.js');
const MODE_KEY = 'youshu_storage_mode';

function memoryWx(initial) {
    const bag = Object.assign({}, initial || {});
    return {
        bag,
        getStorageSync: (key) => (Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : ''),
        setStorageSync: (key, value) => { bag[key] = value; },
        removeStorageSync: (key) => { delete bag[key]; },
    };
}

const emptyOverview = {
    month: '2026-11', incomeText: '0.00', expenseText: '0.00', balanceText: '0.00',
    income: 0, expense: 0, balance: 0, recordCount: 0, records: [], budgetHint: '',
};

function sharedImpl(options) {
    const config = options || {};
    const stats = { init: 0, calls: 0 };
    const ok = (data) => ({ data, error: null });
    return {
        stats,
        init: async () => {
            stats.init += 1;
            return config.initError ? { data: null, error: config.initError } : ok({ generated: 0 });
        },
        getAccounts: async () => {
            stats.calls += 1;
            return ok([{ id: 'c1', name: '默认账户', balanceText: '0.00', initialBalanceText: '0.00' }]);
        },
        getMonthOverview: async () => { stats.calls += 1; return ok(emptyOverview); },
        getStats: async () => { stats.calls += 1; return ok({ categoryRows: [], trendRows: [], budgetRows: [] }); },
        getProfile: async () => {
            stats.calls += 1;
            if (config.profileError) return { data: null, error: config.profileError };
            return ok({ nickname: '云端', avatar: 'cat', avatarEmoji: '🐱', recordCount: 0 });
        },
    };
}

function loadFacade(options) {
    delete require.cache[storePath];
    const originalLoad = Module._load;
    // 保留 global.wx 不还原：切换模式要写偏好，后续调用也要继续用它。
    global.wx = options.wx;
    Module._load = function (request, parent) {
        if (parent && parent.filename && parent.filename.indexOf(utilsDir) === 0) {
            if (request === './cloud') {
                return {
                    cloud: { database: { from() { return {}; } } },
                    cloudAvailable: options.cloudAvailable !== false,
                    cloudError: options.cloudError || null,
                };
            }
            if (request === './ledger-store.cloud') return options.shared;
        }
        return originalLoad.apply(this, arguments);
    };
    try {
        return require(storePath);
    } finally {
        Module._load = originalLoad;
    }
}

let passed = 0;
function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        console.log('PASS ' + name);
    } else {
        console.log('FAIL ' + name + (detail === undefined ? '' : ' -> ' + JSON.stringify(detail)));
        process.exitCode = 1;
    }
}

async function main() {
    // 1. 默认走云端
    const fresh = memoryWx();
    const a = loadFacade({ wx: fresh, shared: sharedImpl() });
    check('默认选择云端', a.mode === 'cloud' && a.storageMode === 'shared', a.mode);
    check('默认没有提示', a.notice === '', a.notice);
    check('暴露云端可用性', a.cloudAvailable === true);

    // 2. 用户选过本机就尊重，即使云端可用也不自动切回
    const savedLocal = memoryWx({ [MODE_KEY]: 'local' });
    const b = loadFacade({ wx: savedLocal, shared: sharedImpl() });
    check('尊重已保存的本机偏好', b.mode === 'local', b.mode);
    check('本机偏好下不弹提示', b.notice === '', b.notice);

    // 3. 云组件没加载：直接本机 + 明确告知
    const c = loadFacade({
        wx: memoryWx(),
        shared: sharedImpl(),
        cloudAvailable: false,
        cloudError: new Error('Cannot find module @tencent-ai/workbuddy-cloud-sdk/miniprogram'),
    });
    check('组件缺失时为本机', c.mode === 'local', c.mode);
    check('组件缺失时提示构建 npm', /构建 npm/.test(c.notice), c.notice);
    check('组件缺失时提示只能用本机', /只能使用本机账本/.test(c.notice), c.notice);

    // 4. 组件缺失时切云端被拒绝，状态不变
    const dWx = memoryWx();
    const d = loadFacade({ wx: dWx, shared: sharedImpl(), cloudAvailable: false });
    const toCloud = await d.setMode('cloud');
    check('组件缺失时切换失败', !!toCloud.error, toCloud.error);
    check('失败后仍是本机', d.mode === 'local', d.mode);
    check('失败不写偏好', dWx.bag[MODE_KEY] === undefined, dWx.bag[MODE_KEY]);
    check('失败原因提示只能本机', /只能继续使用本机账本/.test(toCloud.error.message), toCloud.error.message);

    // 5. 云端探测被域名拦截：拒绝切换
    const eWx = memoryWx();
    const blocked = sharedImpl({ initError: { code: 'CLIENT_EXCEPTION', message: 'request:fail url not in domain list' } });
    const e = loadFacade({ wx: eWx, shared: blocked });
    check('初始仍尝试云端', e.mode === 'cloud', e.mode);
    const switchBlocked = await e.setMode('cloud');
    check('探测失败不报错切错', switchBlocked.error === null || e.mode === 'cloud');
    // 上面调用因为已是云端会短路，先切到本机再切回，才能触发探测
    await e.setMode('local');
    check('可以切到本机', e.mode === 'local', e.mode);
    const retry = await e.setMode('cloud');
    check('探测失败时拒绝切云端', !!retry.error, retry.error);
    check('拒绝后留在本机', e.mode === 'local', e.mode);
    check('拒绝后偏好仍是本机', eWx.bag[MODE_KEY] === 'local', eWx.bag[MODE_KEY]);
    check('拒绝原因提到域名', /request 合法域名/.test(retry.error.message), retry.error.message);

    // 6. 正常切到云端
    const fWx = memoryWx({ [MODE_KEY]: 'local' });
    const okShared = sharedImpl();
    const f = loadFacade({ wx: fWx, shared: okShared });
    check('初始为本机', f.mode === 'local', f.mode);
    const switched = await f.setMode('cloud');
    check('切换云端成功', switched.error === null && f.mode === 'cloud', switched.error);
    check('写入云端偏好', fWx.bag[MODE_KEY] === 'cloud', fWx.bag[MODE_KEY]);
    check('切换时做过探测', okShared.stats.init > 0, okShared.stats.init);
    const profile = await f.getProfile();
    check('切换后读的是云端', profile.data && profile.data.nickname === '云端', profile.data);

    // 7. 切回本机后不再请求云端
    const back = await f.setMode('local');
    check('切回本机成功', back.error === null && f.mode === 'local', back.error);
    check('写入本机偏好', fWx.bag[MODE_KEY] === 'local', fWx.bag[MODE_KEY]);
    const callsBefore = okShared.stats.calls;
    await f.getProfile();
    check('本机模式不请求云端', okShared.stats.calls === callsBefore, okShared.stats.calls);

    // 8. 重复切同一模式直接返回，不做多余探测
    const again = await f.setMode('local');
    check('重复切本机不报错', again.error === null, again.error);

    // 9. 运行中降级不覆盖用户偏好（下次启动仍重试云端）
    const gWx = memoryWx();
    const flaky = sharedImpl({ profileError: { code: 'CLIENT_EXCEPTION', message: 'request:fail url not in domain list' } });
    const g = loadFacade({ wx: gWx, shared: flaky });
    check('降级前在云端', g.mode === 'cloud', g.mode);
    const degraded = await g.getProfile();
    check('降级后本机接管成功返回', degraded.error === null, degraded.error);
    check('降级后模式变本机', g.mode === 'local', g.mode);
    check('降级给出说明', /本机账本/.test(g.notice), g.notice);
    check('降级不写入本机偏好', gWx.bag[MODE_KEY] === undefined, gWx.bag[MODE_KEY]);

    console.log('\nTOTAL PASS ' + passed);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
