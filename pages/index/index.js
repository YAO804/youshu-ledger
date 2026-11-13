const store = require('../../utils/ledger-store');
const { currentMonth, shiftMonth } = require('../../utils/format');

Page({
    data: {
        month: '',
        monthLabel: '',
        incomeText: '0.00',
        expenseText: '0.00',
        balanceText: '0.00',
        recordCount: 0,
        records: [],
        viewState: 'loading',
        errorText: '',
        budgetHint: '',
        budgetOver: false,
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
        this.setData({ viewState: 'loading' });
        const { data, error } = await store.getMonthOverview(this.data.month);
        if (error) {
            this.setData({ viewState: 'error', errorText: error.message });
            return;
        }
        this.setData({
            viewState: 'ready',
            monthLabel: data.month,
            incomeText: data.incomeText,
            expenseText: data.expenseText,
            balanceText: data.balanceText,
            recordCount: data.recordCount,
            records: data.records,
            budgetHint: data.budgetHint,
            budgetOver: data.budgetHint.indexOf('超预算') >= 0,
        });
    },

    onPrevMonth() {
        this.setData({ month: shiftMonth(this.data.month, -1) }, () => this.refresh());
    },

    onNextMonth() {
        this.setData({ month: shiftMonth(this.data.month, 1) }, () => this.refresh());
    },

    onDeleteRecord(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '删除账目',
            content: '删除后无法恢复，确认删除？',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) return;
                const { error } = await store.removeRecord(id);
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已删除', icon: 'success' });
                await this.refresh();
            },
        });
    },
});
