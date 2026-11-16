// 回归测试：收支趋势窗口的定位规则、柱高归一化，以及概览页 6 根柱子的二次归一化。
// 统计页支持横向拖动 + 点柱子切月，窗口一旦漂移或柱高算错，交互就会变得不可预期。
const path = require('path');

const root = path.resolve(__dirname, '..');
const { trendMonths, buildTrendRows, tailTrendRows } = require(path.join(root, 'utils/trend.js'));

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

const TODAY = '2026-11';

/* 窗口定位 */

const current = trendMonths('2026-11', { today: TODAY });
check('默认窗口 12 个月', current.length === 12, current.length);
check('默认窗口末位是当月', current[11] === '2026-11', current[11]);
check('默认窗口首位是 11 个月前', current[0] === '2025-12', current[0]);
check('窗口严格升序', current.every((m, i) => i === 0 || m > current[i - 1]), current);

// 点窗口内靠前的柱子：右界不动，图不会整体漂移，否则用户点一下画面就跳走。
const pickEarly = trendMonths('2026-03', { today: TODAY });
check('点窗口内早月窗口不漂移', pickEarly.join(',') === current.join(','), pickEarly);

// 顶部箭头翻到 12 个月以前：窗口必须整体左移，保证选中月在区间内。
const deepPast = trendMonths('2024-05', { today: TODAY });
check('翻到很久以前窗口跟着走', deepPast[11] === '2024-05', deepPast[11]);
check('翻走后仍为 12 个月', deepPast.length === 12, deepPast.length);
check('翻走后同样升序', deepPast.every((m, i) => i === 0 || m > deepPast[i - 1]), deepPast);

// 补记未来月份：右界跟着选中月，不能把未来月排除在外。
const future = trendMonths('2027-02', { today: TODAY });
check('未来月份时右界跟随', future[11] === '2027-02', future[11]);

check('自定义窗口长度', trendMonths('2026-11', { today: TODAY, size: 6 }).length === 6);
check('非法 size 回落默认 12', trendMonths('2026-11', { today: TODAY, size: 0 }).length === 12);
check('不传 month 用今天', trendMonths('', { today: TODAY })[11] === TODAY);

/* 柱子构造 */

const rows = buildTrendRows(current, (m) => {
    if (m === '2026-11') return { income: 9000, expense: 4500 };
    if (m === '2026-10') return { income: 0, expense: 2000 };
    return { income: 0, expense: 0 };
});

check('行数与月份数一致', rows.length === 12, rows.length);
check('标签是两位月份', rows[11].label === '11月', rows[11].label);
check('金额格式化为两位小数', rows[11].incomeText === '90.00' && rows[11].expenseText === '45.00', rows[11]);
check('最高柱归一化到 100', rows[11].incomeHeight === 100, rows[11].incomeHeight);
check('支出按同一基准换算', rows[11].expenseHeight === 50, rows[11].expenseHeight);
check('空月份保留最小短桩', rows[0].incomeHeight === 4, rows[0].incomeHeight);
check('首位带年份标签', rows[0].yearLabel === '2025', rows[0].yearLabel);
check('1 月也带年份标签', rows[1].yearLabel === '2026', rows[1].yearLabel);
check('普通月份不带年份', rows[11].yearLabel === '', rows[11].yearLabel);

/* 概览页：从 12 个月里取最后 6 个月，柱高要按这 6 个月重新归一化 */

const tail = tailTrendRows(rows, 6);
check('尾段取最后 6 个月', tail.length === 6 && tail[5].id === '2026-11', tail.map((r) => r.id));
check('尾段不修改入参', rows[11].expenseHeight === 50 && rows[0].incomeHeight === 4, rows[11]);
check('尾段重新归一化到 100', tail[5].incomeHeight === 100, tail[5].incomeHeight);
check('尾段内的最高支出仍占 50', tail[5].expenseHeight === 50, tail[5].expenseHeight);

// 只看最后 6 个月时，如果最高值落在窗口外，重算后窗口内的柱子应该变高。
const withSpike = buildTrendRows(current, (m) => (m === '2025-12' ? { income: 1000000, expense: 0 } : { income: 1000, expense: 0 }));
check('长窗口里本月柱高被压到 4 以下取最小值', withSpike[11].incomeHeight === 4, withSpike[11].incomeHeight);
const renormalized = tailTrendRows(withSpike, 6);
check('切 6 个月后本月柱高恢复', renormalized[5].incomeHeight === 100, renormalized[5].incomeHeight);

check('空数组不报错', tailTrendRows([], 6).length === 0);
check('undefined 输入不报错', tailTrendRows(undefined, 6).length === 0);

console.log('\nTOTAL PASS ' + passed);
