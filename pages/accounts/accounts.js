const store = require('../../utils/ledger-store');
const { toCents } = require('../../utils/format');

Page({
    data: {
        rows: [],
        formName: '',
        formInitial: '',
        editingId: '',
    },

    async onShow() {
        await getApp().ensureReady();
        await this.refresh();
    },

    async refresh() {
        const { data, error } = await store.getAccounts();
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ rows: data });
    },

    onNameInput(event) {
        this.setData({ formName: event.detail.value });
    },

    onInitialInput(event) {
        this.setData({ formInitial: event.detail.value });
    },

    async onSave() {
        const name = this.data.formName.trim();
        if (!name) {
            wx.showToast({ title: '请填写账户名称', icon: 'none' });
            return;
        }
        const payload = {
            name,
            type: 'other',
            initialBalance: this.data.formInitial ? toCents(this.data.formInitial) : 0,
        };
        const { error } = this.data.editingId
            ? await store.updateAccount(this.data.editingId, payload)
            : await store.createAccount(payload);
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ formName: '', formInitial: '', editingId: '' });
        wx.showToast({ title: '已保存', icon: 'success' });
        await this.refresh();
    },

    onEdit(event) {
        const row = this.data.rows.find((r) => r.id === event.currentTarget.dataset.id);
        if (!row) return;
        this.setData({
            editingId: row.id,
            formName: row.name,
            formInitial: row.initialBalanceText,
        });
    },

    onCancelEdit() {
        this.setData({ editingId: '', formName: '', formInitial: '' });
    },

    onDelete(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '删除账户',
            content: '删除后无法恢复，确认删除？',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) return;
                const { error } = await store.removeAccount(id);
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    return;
                }
                await this.refresh();
            },
        });
    },
});
