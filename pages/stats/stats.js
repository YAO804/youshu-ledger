const store = require('../../utils/ledger-store');
const { currentMonth, shiftMonth } = require('../../utils/format');

Page({
    data: {
        month: '',
        monthLabel: '',
        trendRows: [],
        // scroll-view 的 scroll-into-view 目标，只在「切月份」时更新，
        // 不跟着每次刷新走，否则用户拖到一半会被拽回去。
        scrollTarget: '',
        categoryRows: [],
        budgetRows: [],
        viewState: 'loading',
        errorText: '',
    },

    onLoad() {
        this.resetToCurrentMonth();
    },

    async onShow() {
        // 统计页是 tab 页、实例常驻：翻了历史月份再切去别的 tab，回来还停在那个月。
        // 这里每次显示都回到当前月，符合「进统计就是看本月」的预期；
        // 但从分类明细返回时得保留月份，否则看完明细一回来月份就被重置了。
        const returningFromDetail = this.leavingForDetail === true;
        this.leavingForDetail = false;
        if (!returningFromDetail) this.resetToCurrentMonth();

        const ready = await getApp().ensureReady();
        if (ready.error) {
            wx.showToast({ title: ready.error.message || '初始化失败', icon: 'none' });
            return;
        }
        await this.refresh();
    },

    resetToCurrentMonth() {
        const month = currentMonth();
        if (this.data.month === month) return;
        this.setData({ month, monthLabel: month });
    },

    async refresh() {
        const { data, error } = await store.getStats(this.data.month);
        if (error) {
            this.setData({ viewState: 'error', errorText: error.message });
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({
            viewState: 'ready',
            monthLabel: this.data.month,
            trendRows: data.trendRows,
            categoryRows: data.categoryRows,
            budgetRows: data.budgetRows,
        }, () => this.scrollTrendTo(this.data.month));
    },

    // scroll-into-view 只在属性值变化时才滚动，而首次渲染时 trendRows 还是空的、
    // 目标 id 根本不存在，所以在 refresh 里设值那次等于白设，等数据渲染完又不会再触发。
    // 结果就是图停在窗口最左边（去年 12 月），当月被藏在右侧要手动拖才能看到。
    // 这里在数据落地之后「清空 → 重新赋值」一次，强制它重新找一次目标元素。
    scrollTrendTo(month) {
        const target = 'trend-' + month;
        if (!month || this.scrolledTarget === target) return;
        this.scrolledTarget = target;
        this.setData({ scrollTarget: '' }, () => {
            this.setData({ scrollTarget: target });
        });
    },

    // 切月份统一走这里，滚动交给 refresh 之后的 scrollTrendTo。
    switchMonth(next) {
        if (!next || next === this.data.month) return;
        this.setData({ month: next, monthLabel: next }, () => this.refresh());
    },

    onPrevMonth() {
        this.switchMonth(shiftMonth(this.data.month, -1));
    },

    onNextMonth() {
        this.switchMonth(shiftMonth(this.data.month, 1));
    },

    // 点趋势图里的柱子直接跳到那个月，下面的分类占比、预算都跟着变。
    onTrendTap(event) {
        this.switchMonth(event.currentTarget.dataset.month);
    },

    // 点分类行看这个分类当月的全部明细。
    onCategoryTap(event) {
        const id = event.currentTarget.dataset.id;
        const name = event.currentTarget.dataset.name || '分类';
        if (!id) return;
        // 标记「这次离开是去看明细」，返回时 onShow 就不会把月份重置成当前月。
        this.leavingForDetail = true;
        wx.navigateTo({
            url: '/pages/category-detail/category-detail?month=' + this.data.month
                + '&categoryId=' + encodeURIComponent(id)
                + '&name=' + encodeURIComponent(name)
                + '&type=expense',
            fail: () => {
                this.leavingForDetail = false;
                wx.showToast({ title: '页面暂未开放', icon: 'none' });
            },
        });
    },
});
