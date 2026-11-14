// 首页概览聚合的纯函数测试：空态安全、指标计算、分类构成、最近记录截断。
const path = require('path');
const { buildDashboard } = require(path.resolve(__dirname, '../utils/dashboard.js'));
const { currentMonth } = require(path.resolve(__dirname, '../utils/format.js'));

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

function category(id, name, amount, percent) {
    return { id, name, amount, percent, amountText: (amount / 100).toFixed(2), percentText: percent + '%' };
}

function emptyOverview() {
    return {
        month: currentMonth(), incomeText: '0.00', expenseText: '0.00', balanceText: '0.00',
        income: 0, expense: 0, balance: 0, recordCount: 0, records: [], budgetHint: '',
    };
}

const month = currentMonth();

// 1. 空态：不能崩，且给出友好的占位
const empty = buildDashboard(emptyOverview(), { categoryRows: [], trendRows: [], budgetRows: [] }, [], month);
check('空态 hasData 为 false', empty.hasData === false);
check('空态 hasExpense 为 false', empty.hasExpense === false);
check('空态仍有 4 个指标卡', empty.metrics.length === 4, empty.metrics.length);
check('空态结余率显示 —', empty.metrics[0].value === '—', empty.metrics[0]);
check('空态最大支出为占位文案', empty.topCategory.name === '暂无支出');
check('空态分类与堆叠条为空', empty.categoryRows.length === 0 && empty.categoryStack.length === 0);
check('空态最近账目为空', empty.recentRecords.length === 0 && empty.allRecords.length === 0);

// 2. 有数据：本月收支、结余率、最大分类
const records = Array.from({ length: 8 }, (_, i) => ({ id: 'r' + i, categoryName: '餐饮' }));
const overview = {
    month,
    incomeText: '8000.00', expenseText: '2000.00', balanceText: '6000.00',
    income: 800000, expense: 200000, balance: 600000,
    recordCount: 8, records,
    budgetHint: '本月支出已超预算 100.00 元',
};
const stats = {
    categoryRows: [
        category('c1', '餐饮', 120000, 60),
        category('c2', '交通', 40000, 20),
        category('c3', '购物', 20000, 10),
        category('c4', '居住', 10000, 5),
        category('c5', '娱乐', 6000, 3),
        category('c6', '医疗', 4000, 2),
    ],
    trendRows: [{ id: 'm1', label: '6月', incomeHeight: 50, expenseHeight: 30 }],
    budgetRows: [{ id: 'b1', name: '总预算', usedText: '2000.00', limitText: '1000.00', percent: 100, over: true }],
};
const accounts = [{ id: 'a1', name: '默认账户', balanceText: '6000.00' }];
const data = buildDashboard(overview, stats, accounts, month);

check('本月收入支出透传', data.incomeText === '8000.00' && data.expenseText === '2000.00');
check('结余率 75%', data.metrics[0].value === '75%', data.metrics[0]);
check('最大支出分类为餐饮', data.topCategory.name === '餐饮' && data.metrics[2].value === '餐饮');
check('本月笔数正确', data.metrics[3].value === '8 笔', data.metrics[3]);
check('日均支出为金额格式', /^¥ \d+\.\d{2}$/.test(data.metrics[1].value), data.metrics[1]);
check('超预算标记', data.budgetOver === true && data.budgetHint.indexOf('超预算') >= 0);
check('最近账目截断为 5 笔', data.recentRecords.length === 5 && data.allRecords.length === 8);
check('趋势/预算/账户透传', data.trendRows.length === 1 && data.budgetRows.length === 1 && data.accountRows.length === 1);

// 3. 分类构成：Top5 + 其他，堆叠条归一化到 100%
check('分类列表只取 Top5', data.categoryRows.length === 5, data.categoryRows.length);
check('分类总数保留 6', data.categoryTotal === 6, data.categoryTotal);
check('堆叠条含「其他」段', data.categoryStack.length === 6 && data.categoryStack[5].id === 'other');
const stackSum = data.categoryStack.reduce((sum, item) => sum + item.percent, 0);
check('堆叠条占比合计约 100%', Math.abs(stackSum - 100) < 0.5, stackSum);
check('每个分类都有颜色', data.categoryRows.every((row) => /^#[0-9a-f]{6}$/i.test(row.color)));
check('最大分类条形为 100%', data.categoryRows[0].barWidth === 100, data.categoryRows[0].barWidth);
check('其余分类条形按比例缩短', data.categoryRows[1].barWidth === 33, data.categoryRows[1].barWidth);

// 4. 负结余
const negative = buildDashboard({
    month, incomeText: '100.00', expenseText: '300.00', balanceText: '-200.00',
    income: 10000, expense: 30000, balance: -20000,
    recordCount: 1, records: [records[0]], budgetHint: '',
}, { categoryRows: [], trendRows: [], budgetRows: [] }, [], month);
check('负结余标记为负', negative.balanceNegative === true);
check('负结余率标红', negative.metrics[0].value === '-200%' && negative.metrics[0].tone === 'expense', negative.metrics[0]);

console.log('\nTOTAL PASS ' + passed);
