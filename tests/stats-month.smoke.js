// 回归测试：统计页是 tab 页、实例常驻，月份会粘住。
// 规则：每次进入统计页回到当前月；但从分类明细返回要保留月份，不能一回来就被重置。
const path = require('path');

const root = path.resolve(__dirname, '..');

let pageConfig = null;
const toasts = [];
let navigateFails = false;

global.Page = (config) => { pageConfig = config; };
global.getApp = () => ({ ensureReady: async () => ({ data: {}, error: null }) });
global.wx = {
    showToast: (opt) => toasts.push(opt && opt.title),
    navigateTo: (opt) => { if (navigateFails && opt && opt.fail) opt.fail({}); },
    getStorageSync: () => '',
    setStorageSync: () => {},
};

require(path.join(root, 'pages/stats/stats.js'));
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

// 造一个最小可用的页面实例：setData 同步生效，refresh 只记次数不真取数。
function createInstance(month) {
    const inst = Object.assign({}, pageConfig);
    inst.data = Object.assign({}, pageConfig.data, { month: month || '' });
    inst.setData = (patch, cb) => {
        Object.assign(inst.data, patch);
        if (typeof cb === 'function') cb();
    };
    inst.refreshCount = 0;
    inst.refresh = async () => { inst.refreshCount += 1; };
    return inst;
}

const THIS_MONTH = currentMonth();
const PAST = shiftMonth(THIS_MONTH, -3);

/* 首次进入 */

const fresh = createInstance('');
fresh.onLoad();
check('首次进入显示当前月', fresh.data.month === THIS_MONTH, fresh.data.month);
check('首次进入带上趋势定位目标', fresh.data.scrollTarget === 'trend-' + THIS_MONTH, fresh.data.scrollTarget);

/* 翻了历史月份后切走别的 tab 再回来 */

const sticky = createInstance(THIS_MONTH);
sticky.setData({ month: PAST, monthLabel: PAST, scrollTarget: 'trend-' + PAST });
check('前提：已切到历史月份', sticky.data.month === PAST, sticky.data.month);

sticky.onShow().then(async () => {
    check('从别的 tab 回来重置为当前月', sticky.data.month === THIS_MONTH, sticky.data.month);
    check('月份标签同步重置', sticky.data.monthLabel === THIS_MONTH, sticky.data.monthLabel);
    check('趋势图滚回当前月', sticky.data.scrollTarget === 'trend-' + THIS_MONTH, sticky.data.scrollTarget);
    check('重置后仍会刷新数据', sticky.refreshCount === 1, sticky.refreshCount);

    /* 进分类明细再返回 */

    const fromDetail = createInstance(THIS_MONTH);
    fromDetail.setData({ month: PAST, monthLabel: PAST });
    fromDetail.onCategoryTap({ currentTarget: { dataset: { id: 'cat_1', name: '居住' } } });
    check('点分类行打了离开标记', fromDetail.leavingForDetail === true);

    await fromDetail.onShow();
    check('从明细返回保留历史月份', fromDetail.data.month === PAST, fromDetail.data.month);
    check('返回后标记已清掉', fromDetail.leavingForDetail === false);
    check('返回后只刷新一次', fromDetail.refreshCount === 1, fromDetail.refreshCount);

    // 再来一次普通的 tab 切回，应该重新回到当前月
    await fromDetail.onShow();
    check('明细返回后再切 tab 仍会重置', fromDetail.data.month === THIS_MONTH, fromDetail.data.month);

    /* navigateTo 失败不能把标记留下 */

    navigateFails = true;
    const failedNav = createInstance(THIS_MONTH);
    failedNav.setData({ month: PAST });
    failedNav.onCategoryTap({ currentTarget: { dataset: { id: 'cat_1', name: '居住' } } });
    check('跳转失败时清掉标记', failedNav.leavingForDetail === false);
    await failedNav.onShow();
    check('跳转失败后不影响下次重置', failedNav.data.month === THIS_MONTH, failedNav.data.month);
    navigateFails = false;

    /* 已经是当前月时不做多余写入 */

    const noop = createInstance(THIS_MONTH);
    let setDataCount = 0;
    const rawSetData = noop.setData;
    noop.setData = (patch, cb) => { setDataCount += 1; rawSetData(patch, cb); };
    await noop.onShow();
    check('已是当前月时不重复 setData', setDataCount === 0, setDataCount);
    check('已是当前月仍会刷新', noop.refreshCount === 1, noop.refreshCount);

    /* 切月份仍按预期工作 */

    const switcher = createInstance(THIS_MONTH);
    switcher.onPrevMonth();
    check('向前翻一个月', switcher.data.month === shiftMonth(THIS_MONTH, -1), switcher.data.month);
    check('箭头切月会滚动趋势图', switcher.data.scrollTarget === 'trend-' + shiftMonth(THIS_MONTH, -1), switcher.data.scrollTarget);

    const tapSwitch = createInstance(THIS_MONTH);
    tapSwitch.onTrendTap({ currentTarget: { dataset: { month: PAST } } });
    check('点柱子切到该月', tapSwitch.data.month === PAST, tapSwitch.data.month);
    check('点柱子不触发滚动', tapSwitch.data.scrollTarget === '', tapSwitch.data.scrollTarget);
    check('点柱子会刷新一次', tapSwitch.refreshCount === 1, tapSwitch.refreshCount);

    tapSwitch.onTrendTap({ currentTarget: { dataset: { month: PAST } } });
    check('重复点同一根柱子不再刷新', tapSwitch.refreshCount === 1, tapSwitch.refreshCount);

    console.log('\nTOTAL PASS ' + passed);
});
