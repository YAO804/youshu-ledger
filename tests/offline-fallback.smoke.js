// 回归测试：云端请求被微信拦截（Error: wx: request failed, request fail url not in ...）
// 时，数据层必须当次运行就退回本机账本，而不是让每个页面都弹错。
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const storePath = path.join(root, 'utils/ledger-store.js');

// 极简本机存储，替掉 wx 的同步存储接口。
function memoryWx() {
    const bag = {};
    return {
        getStorageSync: (key) => (Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : ''),
        setStorageSync: (key, value) => { bag[key] = value; },
        removeStorageSync: (key) => { delete bag[key]; },
    };
}

// 云端每次请求都抛指定 error，用来模拟域名白名单拦截 / 网络失败。
function brokenCloud(error) {
    const stats = { requests: 0 };
    return {
        stats,
        client: {
            database: {
                from() {
                    stats.requests += 1;
                    throw error;
                },
            },
        },
    };
}

function loadFacade(client, available) {
    // 云实现里 `const { cloud } = require('./cloud')` 是模块级常量，
    // 不一起清缓存就会继续用上一次注入的客户端。
    delete require.cache[storePath];
    delete require.cache[path.join(root, 'utils/ledger-store.cloud.js')];
    const originalLoad = Module._load;
    Module._load = function (request, parent) {
        if (request === './cloud' && parent && parent.filename
            && parent.filename.indexOf(path.join(root, 'utils') + path.sep) === 0) {
            return { cloud: client, cloudAvailable: available, cloudError: null };
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
    global.wx = memoryWx();

    // 1. 域名被拦截：init 之后自动退回本机账本
    const blocked = brokenCloud(new Error('request:fail url not in domain list'));
    const store = loadFacade(blocked.client, true);

    check('初始仍在共享账本', store.storageMode === 'shared', store.storageMode);
    check('初始没有降级提示', store.notice === '', store.notice);

    const ready = await store.init();
    check('init 不向页面报错', ready.error === null, ready.error);
    check('降级到本机账本', store.storageMode === 'local', store.storageMode);
    check('给出降级提示', /本机账本/.test(store.notice), store.notice);
    check('降级前确实打过云端', blocked.stats.requests > 0, blocked.stats.requests);

    // 2. 降级后不再重试云端，直接读本机
    const requestsAfterDegrade = blocked.stats.requests;
    const overview = await store.getMonthOverview('2026-03');
    check('降级后概览可用', overview.error === null && !!overview.data, overview.error);
    check('降级后不再打云端', blocked.stats.requests === requestsAfterDegrade, blocked.stats.requests);
    check('本机概览带金额数值', typeof overview.data.income === 'number'
        && typeof overview.data.expense === 'number'
        && typeof overview.data.balance === 'number', overview.data);

    // 3. 本机账本可写：默认账户与分类都已就绪
    const accounts = await store.getAccounts();
    check('账户已铺好种子', accounts.error === null && accounts.data.length >= 1, accounts.error);
    check('第一项是默认账户', accounts.data[0].name === '默认账户', accounts.data[0]);

    const categories = await store.getCategories();
    const expenseCategory = (categories.data || []).find((row) => row.type === 'expense');
    check('分类已铺好种子', !!expenseCategory, categories.error);

    const created = await store.createRecord({
        type: 'expense', amount: 2350, occurredAt: '2026-03-05',
        categoryId: expenseCategory.id, accountId: accounts.data[0].id, note: '降级写入',
    });
    check('降级后仍能记账', created.error === null && !!created.data, created.error);

    const dashboard = await store.getDashboard('2026-03');
    check('降级后概览聚合可用', dashboard.error === null && !!dashboard.data, dashboard.error);
    check('首页能看到刚记的一笔', dashboard.data && dashboard.data.expenseText === '23.50', dashboard.data && dashboard.data.expenseText);

    // 4. 非域名类的业务错误不该误判成离线
    const boom = brokenCloud(new Error('boom'));
    const strict = loadFacade(boom.client, true);
    const failed = await strict.init();
    check('普通错误不降级', strict.storageMode === 'shared', strict.storageMode);
    check('普通错误原样返回', failed.error !== null, failed.error);
    check('普通错误没有降级提示', strict.notice === '', strict.notice);

    // 5. SDK 缺失时从一开始就是本机账本，并带说明
    const missing = loadFacade({ database: { from() { throw new Error('云服务组件未加载'); } } }, false);
    check('组件缺失即本机账本', missing.storageMode === 'local', missing.storageMode);
    check('组件缺失给出说明', /云服务组件未加载/.test(missing.notice), missing.notice);

    console.log('\nTOTAL PASS ' + passed);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
