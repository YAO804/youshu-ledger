const store = require('../../utils/ledger-store');
const { currentMonth, shiftMonth } = require('../../utils/format');

Page({
    data: {
        month: '',
        monthLabel: '',
        incomeText: '0.00',
        expenseText: '0.00',
        balanceText: '0.00',
        balanceNegative: false,
        recordCount: 0,
        hasData: false,
        hasExpense: false,
        metrics: [],
        topCategory: { name: '暂无支出', amountText: '0.00', percentText: '0%' },
        categoryRows: [],
        categoryTotal: 0,
        categoryStack: [],
        trendRows: [],
        budgetRows: [],
        accountRows: [],
        recentRecords: [],
        allRecords: [],
        displayRecords: [],
        showAll: false,
        toggleText: '',
        budgetHint: '',
        budgetOver: false,
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
        this.setData({ viewState: 'loading' });
        const { data, error } = await store.getDashboard(this.data.month);
        if (error) {
            this.setData({ viewState: 'error', errorText: error.message });
            return;
        }
        this.setData(Object.assign({ viewState: 'ready' }, data, {
            showAll: false,
            displayRecords: data.recentRecords,
            toggleText: data.recordCount > 5 ? '查看全部 ' + data.recordCount + ' 笔' : '',
        }));
    },

    onPrevMonth() {
        this.setData({ month: shiftMonth(this.data.month, -1) }, () => this.refresh());
    },

    onNextMonth() {
        this.setData({ month: shiftMonth(this.data.month, 1) }, () => this.refresh());
    },

    onToggleRecords() {
        const showAll = !this.data.showAll;
        this.setData({
            showAll,
            displayRecords: showAll ? this.data.allRecords : this.data.recentRecords,
            toggleText: showAll ? '收起' : '查看全部 ' + this.data.recordCount + ' 笔',
        });
    },

    onGoStats() {
        wx.switchTab({ url: '/pages/stats/stats' });
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
