// 首页概览的数据组装：输入已聚合的结果，输出页面可直接渲染的字段。
// 纯函数，不碰 wx / 云 API，便于单测。
// 设计参考主流开源记账项目的 Dashboard：指标卡 + 分类构成 + 趋势 + 最近记录 + 空态安全。
const { fromCents, currentMonth } = require('./format');
const { tailTrendRows } = require('./trend');

const CATEGORY_COLORS = ['#2f6fed', '#f0a020', '#d9534f', '#2f9e6b', '#8a63d2'];
const OTHER_COLOR = '#c8ced8';

function daysElapsed(month) {
    const now = new Date();
    if (month === currentMonth()) return Math.max(1, now.getDate());
    const parts = String(month).split('-');
    const year = Number(parts[0]);
    const mon = Number(parts[1]);
    if (!year || !mon) return 30;
    return new Date(year, mon, 0).getDate();
}

function buildDashboard(overview, stats, accounts, month) {
    const income = Number(overview.income) || 0;
    const expense = Number(overview.expense) || 0;
    const balance = Number(overview.balance) || 0;
    const categoryRows = (stats && stats.categoryRows) || [];
    // 概览只画 6 根柱子。优先用数据层算好的「以选中月为右界」那 6 个月；
    // 只有 12 个月窗口的旧调用方（测试与兼容路径）才退回取尾段重新归一化。
    const overviewTrend = stats && stats.overviewTrendRows;
    const trendRows = (overviewTrend && overviewTrend.length)
        ? overviewTrend
        : tailTrendRows((stats && stats.trendRows) || [], 6);
    const budgetRows = (stats && stats.budgetRows) || [];
    const records = (overview && overview.records) || [];
    const accountRows = (accounts || []).map((a) => ({
        id: a.id,
        name: a.name,
        balanceText: a.balanceText,
    }));

    const savingsRate = income > 0 ? Math.round((balance / income) * 100) : null;
    const avgDaily = Math.round(expense / daysElapsed(month));

    const shown = categoryRows.slice(0, 5);
    const restAmount = categoryRows.slice(5).reduce((sum, row) => sum + (row.amount || 0), 0);
    const maxAmount = shown.length ? shown[0].amount || 1 : 1;

    const topRows = shown.map((row, index) => Object.assign({}, row, {
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        barWidth: Math.max(3, Math.round(((row.amount || 0) / maxAmount) * 100)),
    }));

    const stack = shown.map((row, index) => ({
        id: row.id,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        amount: row.amount || 0,
    }));
    if (restAmount > 0) stack.push({ id: 'other', color: OTHER_COLOR, amount: restAmount });
    const stackTotal = stack.reduce((sum, item) => sum + item.amount, 0) || 1;
    stack.forEach((item) => {
        item.percent = Math.round((item.amount / stackTotal) * 1000) / 10;
    });

    const top = categoryRows[0] || null;
    const topCategory = top
        ? { name: top.name, amountText: top.amountText, percentText: top.percentText }
        : { name: '暂无支出', amountText: '0.00', percentText: '0%' };

    const metrics = [
        { key: 'rate', label: '结余率', value: savingsRate === null ? '—' : savingsRate + '%', tone: savingsRate !== null && savingsRate < 0 ? 'expense' : '' },
        { key: 'avg', label: '日均支出', value: '¥ ' + fromCents(avgDaily), tone: '' },
        { key: 'top', label: '最大支出', value: topCategory.name, tone: '' },
        { key: 'count', label: '本月笔数', value: (overview.recordCount || 0) + ' 笔', tone: '' },
    ];

    return {
        month: month,
        monthLabel: month,
        incomeText: overview.incomeText,
        expenseText: overview.expenseText,
        balanceText: overview.balanceText,
        balanceNegative: balance < 0,
        recordCount: overview.recordCount || 0,
        hasData: records.length > 0,
        hasExpense: categoryRows.length > 0,
        metrics,
        topCategory,
        categoryRows: topRows,
        categoryTotal: categoryRows.length,
        categoryStack: stack,
        trendRows,
        budgetRows,
        accountRows,
        recentRecords: records.slice(0, 5),
        allRecords: records,
        budgetHint: overview.budgetHint || '',
        budgetOver: String(overview.budgetHint || '').indexOf('超预算') >= 0,
    };
}

module.exports = { buildDashboard, CATEGORY_COLORS };
