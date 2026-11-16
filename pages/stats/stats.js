const store = require('../../utils/ledger-store');
const { currentMonth, shiftMonth } = require('../../utils/format');

Page({
    data: {
        month: '',
        monthLabel: '',
        trendRows: [],
        categoryRows: [],
        budgetRows: [],
        viewState: 'loading',
        errorText: '',
    },

    onLoad() {
        this.setData({ month: currentMonth() });
    },

    async onShow() {
        const ready = await getApp().ensureReady();
        if (ready.error) {
            wx.showToast({ title: ready.error.message || '初始化失败', icon: 'none' });
            return;
        }
        await this.refresh();
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
        });
    },

    onPrevMonth() {
        this.setData({ month: shiftMonth(this.data.month, -1) }, () => this.refresh());
    },

    onNextMonth() {
        this.setData({ month: shiftMonth(this.data.month, 1) }, () => this.refresh());
    },

    // 点分类行看这个分类当月的全部明细。
    onCategoryTap(event) {
        const id = event.currentTarget.dataset.id;
        const name = event.currentTarget.dataset.name || '分类';
        if (!id) return;
        wx.navigateTo({
            url: '/pages/category-detail/category-detail?month=' + this.data.month
                + '&categoryId=' + encodeURIComponent(id)
                + '&name=' + encodeURIComponent(name)
                + '&type=expense',
            fail: () => wx.showToast({ title: '页面暂未开放', icon: 'none' }),
        });
    },
});
