const store = require('../../utils/ledger-store');
const { toCents, today } = require('../../utils/format');
const { confirmRemoveRecord } = require('../../utils/record-actions');

const RECENT_LIMIT = 5;

Page({
    data: {
        formType: 'expense',
        amount: '',
        categoryNames: [],
        categoryIds: [],
        categoryIndex: 0,
        categoryName: '请选择',
        accountNames: [],
        accountIds: [],
        accountIndex: 0,
        accountName: '请选择',
        date: '',
        note: '',
        hintText: '',
        saving: false,
        recentRecords: [],
        storageNotice: '',
    },

    onLoad() {
        this.setData({ date: today() });
    },

    async onShow() {
        const ready = await getApp().ensureReady();
        if (ready.error) {
            wx.showToast({ title: ready.error.message || '初始化失败', icon: 'none' });
            return;
        }
        await this.loadOptions();
        await this.loadRecent();
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

    // 最近记录是保存后的即时确认，取不到就保持原样，不打断记账主流程。
    async loadRecent() {
        const { data, error } = await store.getRecentRecords(RECENT_LIMIT);
        // 降级可能就发生在这次请求里，请求后再同步一次提示条。
        this.setData({ storageNotice: store.notice });
        if (error || !data) return;
        this.setData({ recentRecords: data });
    },

    async onTypeChange(event) {
        const formType = event.currentTarget.dataset.type;
        this.setData({ formType, hintText: '' });
        const categories = await store.getCategories(formType);
        this.setData({
            categoryNames: categories.data.map((c) => c.name),
            categoryIds: categories.data.map((c) => c.id),
            categoryIndex: 0,
            categoryName: categories.data.length ? categories.data[0].name : '请先添加分类',
        });
    },

    onCategoryChange(event) {
        const index = Number(event.detail.value);
        this.setData({ categoryIndex: index, categoryName: this.data.categoryNames[index] });
    },

    onAccountChange(event) {
        const index = Number(event.detail.value);
        this.setData({ accountIndex: index, accountName: this.data.accountNames[index] });
    },

    onAmountInput(event) {
        this.setData({ amount: event.detail.value, hintText: '' });
    },

    onNoteInput(event) {
        this.setData({ note: event.detail.value });
    },

    onDateChange(event) {
        this.setData({ date: event.detail.value });
    },

    async onSubmit() {
        if (this.data.saving) return;
        const amountCents = toCents(this.data.amount);
        if (!amountCents) {
            this.setData({ hintText: '请输入大于 0 的金额' });
            return;
        }
        const categoryId = this.data.categoryIds[this.data.categoryIndex];
        const accountId = this.data.accountIds[this.data.accountIndex];
        if (!categoryId || !accountId) {
            this.setData({ hintText: '请先在「我的」里添加分类和账户' });
            return;
        }
        this.setData({ saving: true });
        const { error } = await store.createRecord({
            type: this.data.formType,
            amountCents,
            categoryId,
            accountId,
            note: this.data.note,
            occurredAt: this.data.date,
        });
        this.setData({ saving: false });
        if (error) {
            this.setData({ hintText: error.message });
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        // 分类、账户、日期都保留，方便同一场景连着记；只清金额和备注。
        this.setData({ amount: '', note: '', hintText: '' });
        if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
        wx.showToast({ title: '已保存', icon: 'success' });
        // 不跳回概览：停留本页，让刚记的那笔出现在下方列表里，可以接着记下一笔。
        await this.loadRecent();
    },

    async onDeleteRecord(event) {
        const id = event.detail && event.detail.id;
        const removed = await confirmRemoveRecord(id);
        if (removed) await this.loadRecent();
    },
});
