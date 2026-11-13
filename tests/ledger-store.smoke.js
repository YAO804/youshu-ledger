const path = require('path');
const Module = require('module');
const root = path.resolve(__dirname, '..');

const tables = {
    ledger_accounts: [],
    ledger_categories: [],
    ledger_records: [],
    ledger_budgets: [],
    ledger_recurring_rules: [],
    ledger_profiles: [],
};
let nextId = 1;

function execute(q) {
    const rows = tables[q.table];
    const match = q.filter || (() => true);
    if (q.op === 'select') {
        return { data: rows.filter(match).map((r) => Object.assign({}, r)), error: null };
    }
    if (q.op === 'insert') {
        const list = Array.isArray(q.payload) ? q.payload : [q.payload];
        const created = list.map((raw) => {
            const row = Object.assign({ id: nextId++, created_at: new Date().toISOString() }, raw);
            rows.push(row);
            return Object.assign({}, row);
        });
        return { data: created, error: null };
    }
    if (q.op === 'update') {
        const affected = [];
        rows.forEach((r) => {
            if (match(r)) {
                Object.assign(r, q.payload);
                affected.push(Object.assign({}, r));
            }
        });
        return { data: affected, error: null };
    }
    if (q.op === 'delete') {
        const removed = [];
        for (let i = rows.length - 1; i >= 0; i -= 1) {
            if (match(rows[i])) removed.push(rows.splice(i, 1)[0]);
        }
        return { data: removed, error: null };
    }
    return { data: [], error: null };
}

function makeQuery(table) {
    const q = {
        table, op: 'select', payload: null, filter: null,
        select() { return this; },
        order() { return this; },
        insert(payload) { this.op = 'insert'; this.payload = payload; return this; },
        update(payload) { this.op = 'update'; this.payload = payload; return this; },
        delete() { this.op = 'delete'; return this; },
        eq(col, val) { this.filter = (r) => r[col] === val; return this; },
        gte(col, val) { this.filter = (r) => r[col] >= val; return this; },
        then(resolve, reject) {
            return Promise.resolve().then(() => execute(q)).then(resolve, reject);
        },
    };
    return q;
}

const mockCloud = {
    auth: {
        getSession: async () => ({ data: { user: { id: 'smoke-user' } }, error: null }),
        signOut: async () => ({ error: null }),
    },
    database: { from: makeQuery },
};

const originalLoad = Module._load;
Module._load = function (request, parent) {
    if (request === './cloud' && parent && parent.filename
        && parent.filename.indexOf(path.join(root, 'utils') + path.sep) === 0) {
        return { cloud: mockCloud, cloudAvailable: true, cloudError: null };
    }
    return originalLoad.apply(this, arguments);
};
const store = require(path.join(root, 'utils/ledger-store.js'));
Module._load = originalLoad;

const { currentMonth, today } = require(path.join(root, 'utils/format.js'));

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

(async () => {
    const month = currentMonth();
    const day = Number(today().slice(8, 10));

    dataOf(await store.init());
    const accounts = dataOf(await store.getAccounts());
    check('首次登录种子 4 个账户', accounts.length === 4, accounts.length);
    const categories = dataOf(await store.getCategories('expense'));
    check('首次登录种子 10 个支出分类', categories.length === 10, categories.length);
    const incomeCategories = dataOf(await store.getCategories('income'));
    const expenseCat = categories[0].id;
    const incomeCat = incomeCategories[0].id;
    const wechat = accounts[0].id;
    const bank = accounts[2].id;

    dataOf(await store.createRecord({
        type: 'expense', amountCents: 3550, categoryId: expenseCat,
        accountId: wechat, note: '午餐', occurredAt: month + '-01',
    }));
    dataOf(await store.createRecord({
        type: 'income', amountCents: 800000, categoryId: incomeCat,
        accountId: bank, note: '月薪', occurredAt: month + '-05',
    }));

    const overview = dataOf(await store.getMonthOverview(month));
    check('月汇总收入 8000.00', overview.incomeText === '8000.00', overview.incomeText);
    check('月汇总支出 35.50', overview.expenseText === '35.50', overview.expenseText);
    check('月结余 7964.50', overview.balanceText === '7964.50', overview.balanceText);
    check('账目数 2', overview.recordCount === 2, overview.recordCount);

    const balances = dataOf(await store.getAccounts());
    check('微信余额由云端账目聚合', balances[0].balanceText === '-35.50', balances[0].balanceText);
    check('银行卡余额由云端账目聚合', balances[2].balanceText === '8000.00', balances[2].balanceText);

    const stats = dataOf(await store.getStats(month));
    check('趋势 6 个月', stats.trendRows.length === 6, stats.trendRows.length);
    check('分类占比 100%', stats.categoryRows[0].percentText === '100%', stats.categoryRows[0]);

    dataOf(await store.setBudget({ month, categoryId: '', amountCents: 10000 }));
    check('预算提示出现', dataOf(await store.getMonthOverview(month)).budgetHint.indexOf('36%') >= 0);
    dataOf(await store.setBudget({ month, categoryId: '', amountCents: 1000 }));
    check('超支提示出现', dataOf(await store.getMonthOverview(month)).budgetHint.indexOf('超预算') >= 0);

    dataOf(await store.setRecurring({
        type: 'expense', amountCents: 1200, categoryId: categories[2].id,
        accountId: accounts[1].id, day, note: '月度固定支出',
    }));
    check('周期规则懒触发生成 1 笔', dataOf(await store.init()).generated === 1);
    check('重复启动幂等不重复记账', dataOf(await store.init()).generated === 0);

    const csv = dataOf(await store.exportCsv());
    check('导出行数正确', csv.count === 3, csv.count);
    check('导出含 BOM', csv.csv.charCodeAt(0) === 0xFEFF);

    const sample = '日期,收支,金额,分类,账户,备注\n'
        + month + '-10,支出,20.00,交通,微信,地铁\n'
        + month + '-11,收入,50.00,兼职,支付宝,外快\n';
    check('CSV 导入 2 笔', dataOf(await store.importCsv(sample)).imported === 2);
    const duplicate = dataOf(await store.importCsv(sample));
    check('CSV 重复导入跳过', duplicate.skipped === 2 && duplicate.imported === 0, duplicate);

    const bad = await store.createRecord({
        type: 'expense', amountCents: 0, categoryId: expenseCat,
        accountId: wechat, occurredAt: today(),
    });
    check('金额为 0 被拒绝', !!bad.error && bad.error.code === 'INVALID_AMOUNT', bad.error);
    check('最终账目数 5', dataOf(await store.getMonthOverview(month)).recordCount === 5);

    dataOf(await store.setProfile({ nickname: '测试用户' }));
    check('昵称写入云端', dataOf(await store.getProfile()).nickname === '测试用户');

    dataOf(await store.resetAll());
    check('清空后归零', dataOf(await store.getMonthOverview(month)).recordCount === 0);

    // 未登录：门面应自动落到本地试用模式，且完全不发云请求
    mockCloud.auth.getSession = async () => ({ data: null, error: null });
    store.resetMode();
    const localMemory = {};
    global.wx = {
        getStorageSync: (k) => (Object.prototype.hasOwnProperty.call(localMemory, k) ? localMemory[k] : ''),
        setStorageSync: (k, v) => { localMemory[k] = v; },
        removeStorageSync: (k) => { delete localMemory[k]; },
    };
    check('未登录自动进入本地试用模式', (await store.getMode()) === 'local');
    dataOf(await store.init());
    const localAccounts = dataOf(await store.getAccounts());
    check('本地模式自带 4 个默认账户', localAccounts.length === 4, localAccounts.length);
    const localCats = dataOf(await store.getCategories('expense'));
    check('本地模式自带默认分类', localCats.length === 10, localCats.length);
    dataOf(await store.createRecord({
        type: 'expense', amountCents: 2000, categoryId: localCats[0].id,
        accountId: localAccounts[0].id, note: '免登录记一笔', occurredAt: month + '-08',
    }));
    const localOverview = dataOf(await store.getMonthOverview(month));
    check('未登录也能记账', localOverview.recordCount === 1, localOverview.recordCount);
    check('未登录账目金额正确', localOverview.expenseText === '20.00', localOverview.expenseText);
    dataOf(await store.resetAll());

    console.log('\nTOTAL PASS ' + passed);
})().catch((e) => {
    console.log('EXCEPTION ' + e.stack);
    process.exitCode = 1;
});
