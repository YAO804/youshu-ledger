const store = require('../../utils/ledger-store');

Page({
    data: {
        formType: 'expense',
        formName: '',
        rows: [],
    },

    async onShow() {
        const ready = await getApp().ensureReady();
        if (ready.error) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        await this.refresh();
    },

    async refresh() {
        const { data, error } = await store.getCategories(this.data.formType);
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ rows: data });
    },

    onTypeChange(event) {
        this.setData({ formType: event.currentTarget.dataset.type }, () => this.refresh());
    },

    onNameInput(event) {
        this.setData({ formName: event.detail.value });
    },

    async onAdd() {
        const name = this.data.formName.trim();
        if (!name) {
            wx.showToast({ title: '请填写分类名称', icon: 'none' });
            return;
        }
        const { error } = await store.createCategory({ name, type: this.data.formType });
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ formName: '' });
        wx.showToast({ title: '已添加', icon: 'success' });
        await this.refresh();
    },

    onDelete(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '删除分类',
            content: '删除后无法恢复，确认删除？',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) return;
                const { error } = await store.removeCategory(id);
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    return;
                }
                await this.refresh();
            },
        });
    },
});
