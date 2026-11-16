// 回归测试：概览页和统计页都是 tabBar 页面、实例常驻，月份会粘住。
// 两个页面同一条规则：每次进入回到当前月，但从分类明细返回要保留月份。
const path = require('path');

const root = path.resolve(__dirname, '..');

let pageConfig = null;
let navigateFails = false;

global.Page = (config) => { pageConfig = config; };
global.getApp = () => ({ ensureReady: async () => ({ data: {}, error: null }) });
global.wx = {
    showToast: () => {},
    navigateTo: (opt) => { if (navigateFails && opt && opt.fail) opt.fail({}); },
    switchTab: () => {},
    getStorageSync: () => '',
    setStorageSync: () => {},
};

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

// 页面文件在 require 时调 Page()，所以要清缓存后逐个加载，才能拿到各自的配置。
function loadPage(relPath) {
    const abs = path.join(root, relPath);
    delete require.cache[require.resolve(abs)];
    pageConfig = null;
    require(abs);
    return pageConfig;
}

// 最小可用实例：setData 同步生效，refresh 只记次数不真取数。
function createInstance(config, month) {
    const inst = Object.assign({}, config);
    inst.data = Object.assign({}, config.data, { month: month || '' });
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

// 两个页面共用同一套月份规则，所以断言表也共用，只有滚动目标这类页面专属字段除外。
const PAGES = [
    { name: '统计页', file: 'pages/stats/stats.js', hasScrollTarget: true },
    { name: '概览页', file: 'pages/index/index.js', hasScrollTarget: false },
];

// 串行跑两个页面：navigateFails 是共享开关，并行会互相干扰。
async function runPage(page) {
    const config = loadPage(page.file);

    check(page.name + '：页面配置可加载', !!config && typeof config.onShow === 'function');

    // 首次进入
    const fresh = createInstance(config, '');
    fresh.onLoad();
    check(page.name + '：首次进入显示当前月', fresh.data.month === THIS_MONTH, fresh.data.month);
    check(page.name + '：首次进入月份标签同步', fresh.data.monthLabel === THIS_MONTH, fresh.data.monthLabel);
    if (page.hasScrollTarget) {
        check(page.name + '：首次进入带趋势定位目标',
            fresh.data.scrollTarget === 'trend-' + THIS_MONTH, fresh.data.scrollTarget);
    }

    // 翻了历史月份后切走别的 tab 再回来
    const sticky = createInstance(config, THIS_MONTH);
    sticky.setData({ month: PAST, monthLabel: PAST });
    if (page.hasScrollTarget) sticky.setData({ scrollTarget: 'trend-' + PAST });

    await sticky.onShow();
    check(page.name + '：从别的 tab 回来重置为当前月', sticky.data.month === THIS_MONTH, sticky.data.month);
    check(page.name + '：月份标签同步重置', sticky.data.monthLabel === THIS_MONTH, sticky.data.monthLabel);
    if (page.hasScrollTarget) {
        check(page.name + '：趋势图滚回当前月',
            sticky.data.scrollTarget === 'trend-' + THIS_MONTH, sticky.data.scrollTarget);
    }
    check(page.name + '：重置后仍会刷新', sticky.refreshCount === 1, sticky.refreshCount);

    // 进分类明细再返回
    const fromDetail = createInstance(config, THIS_MONTH);
    fromDetail.setData({ month: PAST, monthLabel: PAST });
    fromDetail.onCategoryTap({ currentTarget: { dataset: { id: 'cat_1', name: '居住' } } });
    check(page.name + '：点分类行打了离开标记', fromDetail.leavingForDetail === true);

    await fromDetail.onShow();
    check(page.name + '：从明细返回保留历史月份', fromDetail.data.month === PAST, fromDetail.data.month);
    check(page.name + '：返回后标记已清掉', fromDetail.leavingForDetail === false);
    check(page.name + '：返回后只刷新一次', fromDetail.refreshCount === 1, fromDetail.refreshCount);

    await fromDetail.onShow();
    check(page.name + '：明细返回后再切 tab 仍会重置', fromDetail.data.month === THIS_MONTH, fromDetail.data.month);

    // navigateTo 失败不能把标记留下
    navigateFails = true;
    const failedNav = createInstance(config, THIS_MONTH);
    failedNav.setData({ month: PAST, monthLabel: PAST });
    failedNav.onCategoryTap({ currentTarget: { dataset: { id: 'cat_1', name: '居住' } } });
    check(page.name + '：跳转失败时清掉标记', failedNav.leavingForDetail === false);
    await failedNav.onShow();
    check(page.name + '：跳转失败后不影响下次重置', failedNav.data.month === THIS_MONTH, failedNav.data.month);
    navigateFails = false;

    // 已经是当前月时不做多余写入
    const noop = createInstance(config, THIS_MONTH);
    let setDataCount = 0;
    const rawSetData = noop.setData;
    noop.setData = (patch, cb) => { setDataCount += 1; rawSetData(patch, cb); };
    await noop.onShow();
    check(page.name + '：已是当前月时不重复 setData', setDataCount === 0, setDataCount);
    check(page.name + '：已是当前月仍会刷新', noop.refreshCount === 1, noop.refreshCount);

    // 箭头翻月份仍可用
    const switcher = createInstance(config, THIS_MONTH);
    switcher.onPrevMonth();
    check(page.name + '：向前翻一个月', switcher.data.month === shiftMonth(THIS_MONTH, -1), switcher.data.month);
    if (page.hasScrollTarget) {
        check(page.name + '：箭头切月会滚动趋势图',
            switcher.data.scrollTarget === 'trend-' + shiftMonth(THIS_MONTH, -1), switcher.data.scrollTarget);
    }

    // 统计页独有：点趋势柱子切月
    if (page.hasScrollTarget) {
        const tapSwitch = createInstance(config, THIS_MONTH);
        tapSwitch.onTrendTap({ currentTarget: { dataset: { month: PAST } } });
        check(page.name + '：点柱子切到该月', tapSwitch.data.month === PAST, tapSwitch.data.month);
        check(page.name + '：点柱子不触发滚动', tapSwitch.data.scrollTarget === '', tapSwitch.data.scrollTarget);
        check(page.name + '：点柱子会刷新一次', tapSwitch.refreshCount === 1, tapSwitch.refreshCount);
        tapSwitch.onTrendTap({ currentTarget: { dataset: { month: PAST } } });
        check(page.name + '：重复点同一根柱子不再刷新', tapSwitch.refreshCount === 1, tapSwitch.refreshCount);
    }
}

(async () => {
    for (let i = 0; i < PAGES.length; i += 1) {
        await runPage(PAGES[i]);
    }
    console.log('\nTOTAL PASS ' + passed);
})();

