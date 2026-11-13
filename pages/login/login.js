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
        await this.handleAuthCallback();
        const { data: session, error } = await cloud.auth.getSession();
        if (!error && session) {
            this.setData({ signedIn: true });
            await this.finishSignIn();
            return;
        }
        this.setData({ signedIn: false });
    },

    // WorkBuddy 小程序授权回跳：把 App.onShow 保存的完整 options 交给 SDK。
    // 动态取方法 + try/catch，保证预览器 / 能力残缺的环境下不中断页面生命周期。
    async handleAuthCallback() {
        const app = getApp();
        const options = app && app.launchOptions;
        if (!options) return;
        const auth = cloud && cloud.auth;
        const name = 'handleWorkBuddyMiniProgramCallback';
        const handler = auth && typeof auth[name] === 'function' ? auth[name] : null;
        if (!handler) return;
        try {
            await handler.call(auth, options);
            app.launchOptions = null;
            store.resetMode();
        } catch (e) {
            // 回跳处理失败按未登录继续，不阻断页面。
        }
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
