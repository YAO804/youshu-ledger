// 回归测试：getRecentRecords 是「跨月、按时间倒序的最近 N 笔」。
// 记一笔页靠它做「刚记的那笔」即时确认，所以补记上月也必须立刻出现在列表里；
// 如果哪天有人把它改成复用 getMonthOverview，这条测试会第一时间红。
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const storePath = path.join(root, 'utils/ledger-store.js');
const cloudPath = path.join(root, 'utils/ledger-store.cloud.js');
const localPath = path.join(root, 'utils/ledger-store.local.js');

function memoryWx() {
    const bag = {};
    return {
        getStorageSync: (key) => (Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : ''),
        setStorageSync: (key, value) => { bag[key] = value; },
        removeStorageSync: (key) => { delete bag[key]; },
    };
}

// 云端不可用，门面直接走本机账本；这里只验跨月排序语义。
function loadLocalFacade() {
    delete require.cache[storePath];
    delete require.cache[cloudPath];
    delete require.cache[localPath];
    const originalLoad = Module._load;
    Module._load = function (request, parent) {
        if (request === './cloud' && parent && parent.filename
            && parent.filename.indexOf(path.join(root, 'utils') + path.sep) === 0) {
            // cloud 版在模块加载时就会校验 client.database.from，必须给个真实函数。
            return {
                cloud: { database: { from() { throw new Error('cloud unavailable'); } } },
                cloudAvailable: false,
                cloudError: null,
            };
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
function dataOf(result) {
    if (result.error) throw new Error(result.error.code + ': ' + result.error.message);
    return result.data;
}
function dates(list) {
    return list.map((row) => row.dateText).join(',');
}

async function main() {
    global.wx = memoryWx();

    const store = loadLocalFacade();
    check('云端不可用时走本机账本', store.storageMode === 'local', store.storageMode);
    check('门面暴露 getRecentRecords', typeof store.getRecentRecords === 'function');

    dataOf(await store.init());
    const accounts = dataOf(await store.getAccounts());
    const categories = dataOf(await store.getCategories('expense'));
    const accountId = accounts[0].id;
    const categoryId = categories[0].id;

    // 空账：返回空数组而不是报错，页面靠 records.length 显示空态。
    const empty = dataOf(await store.getRecentRecords(5));
    check('空账返回空数组', Array.isArray(empty) && empty.length === 0, empty);

    const expenseCats = categories.map((c) => c.id);
    const rows = [
        { occurredAt: '2026-09-30', amountCents: 9900, categoryId: expenseCats[3] || categoryId, note: '季末' },
        { occurredAt: '2026-11-16', amountCents: 1200, categoryId: expenseCats[0] || categoryId, note: '早餐' },
        { occurredAt: '2026-10-28', amountCents: 300, categoryId: expenseCats[4] || categoryId, note: '猫砂' },
        { occurredAt: '2026-11-05', amountCents: 2500, categoryId: expenseCats[1] || categoryId, note: '打车' },
    ];
    for (const row of rows) {
        dataOf(await store.createRecord({
            type: 'expense',
            amountCents: row.amountCents,
            categoryId: row.categoryId,
            accountId,
            note: row.note,
            occurredAt: row.occurredAt,
        }));
    }

    const recent = dataOf(await store.getRecentRecords(5));
    check('跨月取满 4 笔', recent.length === 4, recent.length);
    check('按时间倒序，不受月份限制', dates(recent) === '11-16,11-05,10-28,09-30', dates(recent));

    const limited = dataOf(await store.getRecentRecords(2));
    check('limit 生效', limited.length === 2 && dates(limited) === '11-16,11-05', dates(limited));

    // 非法 limit 不能把列表变空，也不能一次拉全表。
    check('limit 为 0 时回落默认 5', dataOf(await store.getRecentRecords(0)).length === 4);
    check('limit 超上限被夹到 50', dataOf(await store.getRecentRecords(999)).length === 4);

    const first = recent[0];
    check('带分类名', first.categoryName === (categories[0].name), first.categoryName);
    check('带账户名', first.accountName === accounts[0].name, first.accountName);
    check('带备注', first.noteText === '早餐', first.noteText);
    check('支出金额带负号', first.amountText === '-12.00', first.amountText);
    check('dateText 只留月日', first.dateText === '11-16', first.dateText);
    check('带 id 供长按删除', typeof first.id === 'string' && first.id.length > 0, first.id);

    // 收入方向：同一接口必须能分辨正负，记一笔页列表直接显示。
    const incomeCats = dataOf(await store.getCategories('income'));
    dataOf(await store.createRecord({
        type: 'income', amountCents: 120000, categoryId: incomeCats[1].id,
        accountId, note: '季度奖', occurredAt: '2026-11-15',
    }));
    const withIncome = dataOf(await store.getRecentRecords(5));
    check('收入插到正确位置', dates(withIncome) === '11-16,11-15,11-05,10-28,09-30', dates(withIncome));
    check('收入金额带正号', withIncome[1].amountText === '+1200.00', withIncome[1].amountText);

    // 删掉之后立刻不再出现：页面删完直接重拉这个接口。
    dataOf(await store.removeRecord(recent[0].id));
    const afterRemove = dataOf(await store.getRecentRecords(5));
    check('删除后不再出现在最近记录', afterRemove.every((row) => row.id !== recent[0].id), afterRemove.length);

    console.log('\nTOTAL PASS ' + passed);
}

main().catch((error) => {
    console.log('EXCEPTION ' + error.stack);
    process.exitCode = 1;
});
