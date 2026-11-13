const path = require('path');
const root = path.resolve(__dirname, '..');

const memory = {};
global.wx = {
    getStorageSync(key) {
        return memory[key];
    },
    setStorageSync(key, value) {
        memory[key] = JSON.parse(JSON.stringify(value));
    },
};

const store = require(path.join(root, 'utils/ledger-store.js'));
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
    check('默认 4 个账户', accounts.length === 4, accounts.length);
    const categories = dataOf(await store.getCategories('expense'));
    check('默认 10 个支出分类', categories.length === 10, categories.length);

    const expense = dataOf(await store.createRecord({
        type: 'expense', amountCents: 3550,
        categoryId: 'cat_e_0', accountId: 'acc_wechat',
        note: '午餐', occurredAt: month + '-01',
    }));
    check('支出写入返回 id', !!expense.id);
    dataOf(await store.createRecord({
        type: 'income', amountCents: 800000,
        categoryId: 'cat_i_0', accountId: 'acc_bank',
        note: '月薪', occurredAt: month + '-05',
    }));

    const overview = dataOf(await store.getMonthOverview(month));
    check('月汇总收入 8000.00', overview.incomeText === '8000.00', overview.incomeText);
    check('月汇总支出 35.50', overview.expenseText === '35.50', overview.expenseText);
    check('月结余 7964.50', overview.balanceText === '7964.50', overview.balanceText);
    check('账目数 2', overview.recordCount === 2, overview.recordCount);

    const balances = dataOf(await store.getAccounts());
    const wechat = balances.find((a) => a.id === 'acc_wechat');
    const bank = balances.find((a) => a.id === 'acc_bank');
    check('微信余额由账目聚合', wechat.balanceText === '-35.50', wechat.balanceText);
    check('银行卡余额由账目聚合', bank.balanceText === '8000.00', bank.balanceText);

    const stats = dataOf(await store.getStats(month));
    check('趋势 6 个月', stats.trendRows.length === 6, stats.trendRows.length);
    check('分类占比 1 行', stats.categoryRows.length === 1, stats.categoryRows.length);
    check('分类占比 100%', stats.categoryRows[0].percentText === '100%', stats.categoryRows[0]);

    dataOf(await store.setBudget({ month, categoryId: '', amountCents: 10000 }));
    const withBudget = dataOf(await store.getMonthOverview(month));
    check('预算提示出现', withBudget.budgetHint.indexOf('36%') >= 0, withBudget.budgetHint);
    dataOf(await store.setBudget({ month, categoryId: '', amountCents: 1000 }));
    const over = dataOf(await store.getMonthOverview(month));
    check('超支提示出现', over.budgetHint.indexOf('超预算') >= 0, over.budgetHint);

    dataOf(await store.setRecurring({
        type: 'expense', amountCents: 1200,
        categoryId: 'cat_e_2', accountId: 'acc_alipay',
        day, note: '月度固定支出',
    }));
    const again = dataOf(await store.init());
    check('周期规则懒触发生成 1 笔', again.generated === 1, again);
    const third = dataOf(await store.init());
    check('重复启动幂等不重复记账', third.generated === 0, third);

    const csv = dataOf(await store.exportCsv());
    check('导出行数正确', csv.count === 3, csv.count);
    check('导出含 BOM', csv.csv.charCodeAt(0) === 0xFEFF);

    const sample = '日期,收支,金额,分类,账户,备注\n'
        + month + '-10,支出,20.00,交通,微信,地铁\n'
        + month + '-11,收入,50.00,兼职,支付宝,外快\n';
    const imported = dataOf(await store.importCsv(sample));
    check('CSV 导入 2 笔', imported.imported === 2, imported);
    const duplicate = dataOf(await store.importCsv(sample));
    check('CSV 重复导入跳过', duplicate.skipped === 2 && duplicate.imported === 0, duplicate);

    const bad = await store.createRecord({
        type: 'expense', amountCents: 0,
        categoryId: 'cat_e_0', accountId: 'acc_wechat', occurredAt: today(),
    });
    check('金额为 0 被拒绝', !!bad.error && bad.error.code === 'INVALID_AMOUNT', bad.error);

    const finalOverview = dataOf(await store.getMonthOverview(month));
    check('最终账目数 5', finalOverview.recordCount === 5, finalOverview.recordCount);

    dataOf(await store.resetAll());
    const empty = dataOf(await store.getMonthOverview(month));
    check('清空后归零', empty.recordCount === 0, empty.recordCount);

    console.log('\nTOTAL PASS ' + passed);
})().catch((e) => {
    console.log('EXCEPTION ' + e.stack);
    process.exitCode = 1;
});
