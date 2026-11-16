// 回归测试：样例数据必须真的覆盖到各类边界，否则「点一下看看 UI」就失去意义。
// 直接对本机账本实现跑，不需要开发者工具。
const path = require('path');

const root = path.resolve(__dirname, '..');

function memoryWx() {
    const bag = {};
    return {
        getStorageSync: (key) => (Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : ''),
        setStorageSync: (key, value) => { bag[key] = value; },
        removeStorageSync: (key) => { delete bag[key]; },
    };
}

global.wx = memoryWx();

const local = require(path.join(root, 'utils/ledger-store.local.js'));
const { seedSampleData, buildCsv, RECORDS } = require(path.join(root, 'utils/sample-data.js'));
const { currentMonth, shiftMonth } = require(path.join(root, 'utils/format.js'));

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

function cents(centsText) {
    return Math.round(Number(String(centsText).replace(/[^\d.-]/g, '')) * 100);
}

async function main() {
    // CSV 本身要能被解析：行数 = 表头 + 记录数
    const csv = buildCsv();
    check('CSV 行数为表头加记录', csv.split('\r\n').length === RECORDS.length + 1, csv.split('\r\n').length);
    check('CSV 里的逗号备注被正确引用', /"卫衣,裤子,帽子"/.test(csv));
    check('CSV 里的换行备注被正确引用', /"猫粮\n猫砂"/.test(csv));

    const seeded = await seedSampleData(local);
    check('样例数据写入成功', seeded.error === null, seeded.error);
    check('写入 40 笔账目', seeded.data && seeded.data.records === RECORDS.length, seeded.data);
    check('没有行被跳过', seeded.data && seeded.data.skipped === 0, seeded.data);

    const thisMonth = currentMonth();

    // 本月：预算超支、金额边界、默认账户
    const now = await local.getMonthOverview(thisMonth);
    check('本月支出 4950.41', now.data.expense === 495041, now.data.expense);
    check('本月收入 9828.36', now.data.income === 982836, now.data.income);
    check('本月结余 4877.95', now.data.balance === 487795, now.data.balance);
    check('本月超支提示', /超预算/.test(now.data.budgetHint), now.data.budgetHint);
    check('本月有一分钱的账目', now.data.records.some((r) => r.amountText === '-0.01'), null);
    check('本月有带换行的备注', now.data.records.some((r) => r.noteText.indexOf('\n') > 0));
    check('本月有超长备注', now.data.records.some((r) => r.noteText.length > 40));

    // 空月份：概览为空态，不报错
    const blankMonth = shiftMonth(thisMonth, -2);
    const blank = await local.getMonthOverview(blankMonth);
    check('空月份记录数为 0', blank.data.recordCount === 0, blank.data.recordCount);
    check('空月份收支都为 0', blank.data.income === 0 && blank.data.expense === 0 && blank.data.balance === 0);
    const blankStats = await local.getStats(blankMonth);
    check('空月份统计不报错', blankStats.error === null, blankStats.error);
    check('空月份趋势仍有 12 根柱', blankStats.data.trendRows.length === 12, blankStats.data.trendRows.length);
    // 空月份本身在窗口内，收支为 0 时留最短桩，标签仍能对齐
    const blankRow = blankStats.data.trendRows.filter((r) => r.id === blankMonth)[0];
    check('空月份在趋势窗口内且只留最短桩',
        !!blankRow && blankRow.incomeHeight === 4 && blankRow.expenseHeight === 4,
        blankRow);

    // 负结余月
    const negative = await local.getMonthOverview(shiftMonth(thisMonth, -3));
    check('负结余月结余为负', negative.data.balance === -173400, negative.data.balance);

    // 收支平衡月
    const even = await local.getMonthOverview(shiftMonth(thisMonth, -1));
    check('收支平衡月结余为 0', even.data.balance === 0, even.data.balance);
    check('平衡月收入等于支出', even.data.income === even.data.expense, [even.data.income, even.data.expense]);

    // 账户边界
    const accounts = await local.getAccounts();
    const byName = {};
    accounts.data.forEach((row) => { byName[row.name] = row; });
    check('信用卡余额为负', cents(byName['信用卡'].balanceText) === -407600, byName['信用卡'] && byName['信用卡'].balanceText);
    check('储蓄卡有初始余额无流水', cents(byName['储蓄卡'].balanceText) === 500000, byName['储蓄卡'] && byName['储蓄卡'].balanceText);
    check('默认账户有流水', byName['默认账户'].balanceText === '-3.00', byName['默认账户'] && byName['默认账户'].balanceText);
    check('账户总数为 6', accounts.data.length === 6, accounts.data.length);

    // 分类：自定义分类存在，且「旅行」是空分类
    const categories = await local.getCategories();
    const names = categories.data.map((row) => row.name);
    check('新增自定义支出分类', names.indexOf('宠物') >= 0 && names.indexOf('旅行') >= 0, names);
    check('新增自定义收入分类', categories.data.some((row) => row.name === '红包' && row.type === 'income'));
    const travel = categories.data.find((row) => row.name === '旅行');
    const travelUsed = now.data.records.concat(blank.data.records).some((r) => r.categoryId === travel.id);
    check('旅行分类保持零流水', !travelUsed);

    // 预算：本月总预算超支、餐饮预算超支、上月不超支
    const stats = await local.getStats(thisMonth);
    const budgetByName = {};
    stats.data.budgetRows.forEach((row) => { budgetByName[row.name] = row; });
    check('本月有两笔预算', stats.data.budgetRows.length === 2, stats.data.budgetRows.length);
    check('总预算标记超支', budgetByName['总预算'] && budgetByName['总预算'].over === true, budgetByName['总预算']);
    check('餐饮预算标记超支', budgetByName['餐饮'] && budgetByName['餐饮'].over === true, budgetByName['餐饮']);
    const lastStats = await local.getStats(shiftMonth(thisMonth, -1));
    check('上月预算不超支', lastStats.data.budgetRows.length === 1 && lastStats.data.budgetRows[0].over === false, lastStats.data.budgetRows);

    // 周期规则：一条启用一条停用
    const rules = await local.getRecurring();
    check('有两条周期规则', rules.data.length === 2, rules.data.length);
    check('一条启用一条停用', rules.data.filter((r) => r.enabled).length === 1, rules.data.map((r) => r.enabled));
    check('周期规则没有立刻生成账目', now.data.recordCount === 17, now.data.recordCount);

    // 重复执行不叠加
    const again = await seedSampleData(local);
    const after = await local.getMonthOverview(thisMonth);
    check('重复生成不叠加数据', again.error === null && after.data.recordCount === 17, after.data.recordCount);

    // 分类明细页依赖的原始字段必须齐全，否则筛选和排序都会失效
    const sampleRows = after.data.records;
    check('记录带分类 id', sampleRows.every((r) => typeof r.categoryId === 'string' && r.categoryId !== ''));
    check('记录带原始日期', sampleRows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.occurredAt))));
    check('记录带整数分金额', sampleRows.every((r) => Number.isInteger(r.amount) && r.amount > 0));

    const dining = categories.data.find((c) => c.name === '餐饮');
    const diningRows = sampleRows.filter((r) => r.categoryId === dining.id);
    check('餐饮分类本月 3 笔', diningRows.length === 3, diningRows.length);
    check('餐饮分类合计 175.50', diningRows.reduce((sum, r) => sum + r.amount, 0) === 17550, diningRows.map((r) => r.amount));

    // 分类行要同时显示占比和笔数，getStats 必须给出每类笔数
    const monthStats = await local.getStats(thisMonth);
    const statByName = {};
    monthStats.data.categoryRows.forEach((row) => { statByName[row.name] = row; });
    check('分类行带笔数', statByName['餐饮'] && statByName['餐饮'].count === 3, statByName['餐饮']);
    check('单笔分类笔数为 1', statByName['居住'] && statByName['居住'].count === 1, statByName['居住']);
    check('笔数合计等于支出笔数',
        Object.keys(statByName).reduce((sum, name) => sum + statByName[name].count, 0) === 14,
        Object.keys(statByName).reduce((sum, name) => sum + statByName[name].count, 0));

    console.log('\nTOTAL PASS ' + passed);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
