const store = require('../../utils/ledger-store');
const { currentMonth, shiftMonth, toCents } = require('../../utils/format');

Page({
    data: {
        month: '',
        monthLabel: '',
        categoryNames: ['总预算'],
        categoryIds: [''],
        categoryIndex: 0,
        categoryName: '总预算',
        formAmount: '',
        rows: [],
    },

    onLoad() {
        this.setData({ month: currentMonth() });
    },

    async onShow() {
        await getApp().ensureReady();
        await this.loadOptions();
        await this.refresh();
    },

    async loadOptions() {
        const { data, error } = await store.getCategories('expense');
        if (error) return;
        this.setData({
            categoryNames: ['总预算'].concat(data.map((c) => c.name)),
            categoryIds: [''].concat(data.map((c) => c.id)),
        });
    },

    async refresh() {
        const { data, error } = await store.getBudgets(this.data.month);
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ rows: data, monthLabel: this.data.month });
    },

    onPrevMonth() {
        this.setData({ month: shiftMonth(this.data.month, -1) }, () => this.refresh());
    },

    onNextMonth() {
        this.setData({ month: shiftMonth(this.data.month, 1) }, () => this.refresh());
    },

    onCategoryChange(event) {
        const index = Number(event.detail.value);
        this.setData({ categoryIndex: index, categoryName: this.data.categoryNames[index] });
    },

    onAmountInput(event) {
        this.setData({ formAmount: event.detail.value });
    },

    async onSave() {
        const amountCents = toCents(this.data.formAmount);
        if (!amountCents) {
            wx.showToast({ title: '请输入大于 0 的预算金额', icon: 'none' });
            return;
        }
        const { error } = await store.setBudget({
            month: this.data.month,
            categoryId: this.data.categoryIds[this.data.categoryIndex],
            amountCents,
        });
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ formAmount: '' });
        wx.showToast({ title: '已保存', icon: 'success' });
        await this.refresh();
    },

    onDelete(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '删除预算',
            content: '删除后无法恢复，确认删除？',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) return;
                const { error } = await store.removeBudget(id);
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    return;
                }
                await this.refresh();
            },
        });
    },
});
