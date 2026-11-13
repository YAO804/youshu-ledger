const { cloud, cloudAvailable } = require('../../utils/cloud');
const store = require('../../utils/ledger-store');

Page({
    data: {
        loggingIn: false,
        loginError: '',
        signedIn: false,
        syncing: false,
        cloudAvailable: !!cloudAvailable,
    },

    async onShow() {
        if (!cloudAvailable) {
            this.setData({ loginError: '云服务组件未加载，当前只能本地试用' });
            return;
        }
        const { data: session, error } = await cloud.auth.getSession();
        if (!error && session) {
            this.setData({ signedIn: true });
            await this.finishSignIn();
            return;
        }
        this.setData({ signedIn: false });
    },

    // 登录成功后把本地试用账目搬到云端；迁移失败保留本地数据，不阻断使用。
    async finishSignIn() {
        if (this.data.syncing) return;
        this.setData({ syncing: true, loginError: '' });
        let result;
        try {
            result = await store.migrateLocalToCloud();
        } catch (e) {
            result = { data: null, error: { message: (e && e.message) || '同步失败' } };
        }
        this.setData({ syncing: false });
        if (result.error) {
            this.setData({ loginError: result.error.message });
            return;
        }
        const count = result.data.migrated;
        if (count > 0) wx.showToast({ title: '已同步 ' + count + ' 笔账目', icon: 'none' });
        getApp().resetSession();
        if (count > 0) {
            setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 900);
        } else {
            wx.switchTab({ url: '/pages/index/index' });
        }
    },

    onSignedIn() {
        this.setData({ signedIn: true });
        this.finishSignIn();
    },

    async onWorkBuddyLogin() {
        if (this.data.loggingIn) return;
        this.setData({ loggingIn: true, loginError: '' });
        const { error } = await cloud.auth.signInWithWorkBuddyMiniProgram({
            redirectPath: 'pages/login/login',
        });
        this.setData({
            loggingIn: false,
            loginError: error && error.code !== 'cancelled' ? (error.message || '登录未完成，请重试') : '',
        });
    },

    onSkip() {
        wx.switchTab({ url: '/pages/index/index' });
    },
});
