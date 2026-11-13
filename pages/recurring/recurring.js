const store = require('../../utils/ledger-store');
const { toCents } = require('../../utils/format');

const DAY_NAMES = [];
for (let d = 1; d <= 28; d += 1) DAY_NAMES.push(d + ' 日');

Page({
    data: {
        formType: 'expense',
        formAmount: '',
        formNote: '',
        categoryNames: [],
        categoryIds: [],
        categoryIndex: 0,
        categoryName: '请选择',
        accountNames: [],
        accountIds: [],
        accountIndex: 0,
        accountName: '请选择',
        dayNames: DAY_NAMES,
        dayIndex: 0,
        dayText: DAY_NAMES[0],
        rows: [],
    },

    async onShow() {
        const ready = await getApp().ensureReady();
        if (ready.error) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        await this.loadOptions();
        await this.refresh();
    },

    async loadOptions() {
        const accounts = await store.getAccounts();
        const categories = await store.getCategories(this.data.formType);
        this.setData({
            accountNames: accounts.data.map((a) => a.name),
            accountIds: accounts.data.map((a) => a.id),
            accountIndex: 0,
            accountName: accounts.data.length ? accounts.data[0].name : '请先添加账户',
            categoryNames: categories.data.map((c) => c.name),
            categoryIds: categories.data.map((c) => c.id),
            categoryIndex: 0,
            categoryName: categories.data.length ? categories.data[0].name : '请先添加分类',
        });
    },

    async refresh() {
        const { data, error } = await store.getRecurring();
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ rows: data });
    },

    async onTypeChange(event) {
        const formType = event.currentTarget.dataset.type;
        this.setData({ formType });
        const categories = await store.getCategories(formType);
        this.setData({
            categoryNames: categories.data.map((c) => c.name),
            categoryIds: categories.data.map((c) => c.id),
            categoryIndex: 0,
            categoryName: categories.data.length ? categories.data[0].name : '请先添加分类',
        });
    },

    onAmountInput(event) {
        this.setData({ formAmount: event.detail.value });
    },

    onNoteInput(event) {
        this.setData({ formNote: event.detail.value });
    },

    onCategoryChange(event) {
        const index = Number(event.detail.value);
        this.setData({ categoryIndex: index, categoryName: this.data.categoryNames[index] });
    },

    onAccountChange(event) {
        const index = Number(event.detail.value);
        this.setData({ accountIndex: index, accountName: this.data.accountNames[index] });
    },

    onDayChange(event) {
        const index = Number(event.detail.value);
        this.setData({ dayIndex: index, dayText: DAY_NAMES[index] });
    },

    async onSave() {
        const amountCents = toCents(this.data.formAmount);
        if (!amountCents) {
            wx.showToast({ title: '请输入大于 0 的金额', icon: 'none' });
            return;
        }
        const categoryId = this.data.categoryIds[this.data.categoryIndex];
        const accountId = this.data.accountIds[this.data.accountIndex];
        if (!categoryId || !accountId) {
            wx.showToast({ title: '请先添加分类和账户', icon: 'none' });
            return;
        }
        const { error } = await store.setRecurring({
            type: this.data.formType,
            amountCents,
            categoryId,
            accountId,
            day: this.data.dayIndex + 1,
            note: this.data.formNote,
        });
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ formAmount: '', formNote: '' });
        wx.showToast({ title: '已添加', icon: 'success' });
        await this.refresh();
    },

    async onToggle(event) {
        const { error } = await store.toggleRecurring(event.currentTarget.dataset.id);
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        await this.refresh();
    },

    onDelete(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '删除规则',
            content: '已生成的账目会保留，确认删除该规则？',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) return;
                const { error } = await store.removeRecurring(id);
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    return;
                }
                await this.refresh();
            },
        });
    },
});
