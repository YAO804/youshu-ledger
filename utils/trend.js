// 收支趋势的窗口与柱子高度：纯函数，本机 / 云端两份数据实现共用同一套算法。
//
// 窗口右界取「选中月」与「当前自然月」中较晚的那个，这样拖动和点选才顺手：
//   - 在窗口内点某根柱子切月份时右界不动，图不会整体漂移，只有选中态和下方数据变；
//   - 用顶部箭头切到比窗口左界还早的月份时，右界才跟着选中月走，保证选中月一定在区间内。
const { fromCents, currentMonth, shiftMonth } = require('./format');

// 默认看一年。再长窗口里全是空月份，反而不好读。
const DEFAULT_TREND_MONTHS = 12;
// 没数据的月份也留一根 4% 的短桩，柱子高低不齐但标签能对齐，看得出「这个月没有记账」。
const MIN_BAR_PERCENT = 4;

function normalizeSize(size) {
    const n = Math.floor(Number(size));
    return n > 0 ? n : DEFAULT_TREND_MONTHS;
}

// 返回按时间升序排列的月份数组，最后一个是窗口右界。
function trendMonths(month, options) {
    const opts = options || {};
    const size = normalizeSize(opts.size);
    const anchor = opts.today || currentMonth();
    const target = month || anchor;

    let right = target > anchor ? target : anchor;
    let left = shiftMonth(right, -(size - 1));
    // 选中月早于窗口左界（用箭头翻到很久以前）时窗口整体左移。
    if (target < left) {
        right = target;
        left = shiftMonth(right, -(size - 1));
    }

    const months = [];
    for (let i = size - 1; i >= 0; i -= 1) {
        months.push(shiftMonth(right, -i));
    }
    return months;
}

// 只在 1 月和窗口第一根柱子下标年份，避免「11月」跨年重复看不出是哪一年。
function yearLabelOf(month, index) {
    return index === 0 || month.slice(5) === '01' ? month.slice(0, 4) : '';
}

function applyHeights(rows) {
    const max = Math.max(1, ...rows.map((r) => Math.max(r.income || 0, r.expense || 0)));
    rows.forEach((r) => {
        r.incomeHeight = Math.max(MIN_BAR_PERCENT, Math.round(((r.income || 0) / max) * 100));
        r.expenseHeight = Math.max(MIN_BAR_PERCENT, Math.round(((r.expense || 0) / max) * 100));
    });
    return rows;
}

// months：trendMonths() 的结果；summaryOf(month) 返回 { income, expense }（单位：分）。
function buildTrendRows(months, summaryOf) {
    const rows = (months || []).map((m, index) => {
        const s = summaryOf(m) || {};
        const income = Number(s.income) || 0;
        const expense = Number(s.expense) || 0;
        return {
            id: m,
            label: m.slice(5) + '月',
            yearLabel: yearLabelOf(m, index),
            incomeText: fromCents(income),
            expenseText: fromCents(expense),
            income,
            expense,
            incomeHeight: MIN_BAR_PERCENT,
            expenseHeight: MIN_BAR_PERCENT,
        };
    });
    return applyHeights(rows);
}

// 从长窗口里取最后 size 个月，并按这 size 个月重新归一化柱高。
// 概览页只画 6 个月，直接切 stats 的 12 个月会让柱子整体缩一半，必须重算。
function tailTrendRows(rows, size) {
    const list = (rows || []).slice(-normalizeSize(size));
    return applyHeights(list.map((r) => Object.assign({}, r)));
}

module.exports = {
    DEFAULT_TREND_MONTHS,
    trendMonths,
    buildTrendRows,
    tailTrendRows,
};
