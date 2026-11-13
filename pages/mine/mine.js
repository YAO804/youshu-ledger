const store = require('../../utils/ledger-store');

Page({
    data: {
        avatarText: '?',
        nicknameInput: '',
        recordCount: 0,
        menuGroups: [
            {
                key: 'basic',
                title: '基础设置',
                items: [
                    { key: 'accounts', text: '支付账户与余额', path: '/pages/accounts/accounts' },
                    { key: 'categories', text: '分类管理', path: '/pages/categories/categories' },
                ],
            },
            {
                key: 'rules',
                title: '记账规则',
                items: [
                    { key: 'budgets', text: '预算与超支提醒', path: '/pages/budgets/budgets' },
                    { key: 'recurring', text: '周期记账规则', path: '/pages/recurring/recurring' },
                ],
            },
            {
                key: 'data',
                title: '数据',
                items: [
                    { key: 'data', text: '账单导入 / 数据导出', path: '/pages/data/data' },
                ],
            },
        ],
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
        const { data, error } = await store.getProfile();
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({
            avatarText: data.avatarText,
            nicknameInput: data.nickname,
            recordCount: data.recordCount,
        });
    },

    onNicknameInput(event) {
        this.setData({ nicknameInput: event.detail.value });
    },

    async onSaveNickname() {
        const { error } = await store.setProfile({ nickname: this.data.nicknameInput });
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        wx.showToast({ title: '已保存', icon: 'success' });
        await this.refresh();
    },

    onMenuTap(event) {
        const path = event.currentTarget.dataset.path;
        if (!path) {
            wx.showToast({ title: '功能暂未开放', icon: 'none' });
            return;
        }
        wx.navigateTo({
            url: path,
            fail: () => wx.showToast({ title: '页面暂未开放', icon: 'none' }),
        });
    },

    async onSignOut() {
        const { cloud } = require('../../utils/cloud');
        const { error } = await cloud.auth.signOut();
        if (error) {
            wx.showToast({ title: error.message || '退出失败', icon: 'none' });
            return;
        }
        getApp().resetSession();
        wx.reLaunch({ url: '/pages/login/login' });
    },

    onReset() {
        wx.showModal({
            title: '清空全部数据',
            content: '所有账目、账户、分类、预算和周期规则都会被删除，且无法恢复。建议先导出备份。确认清空？',
            confirmText: '确认清空',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) return;
                const { error } = await store.resetAll();
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已清空', icon: 'success' });
                await this.refresh();
            },
        });
    },
});
