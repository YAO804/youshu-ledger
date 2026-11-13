const { cloud } = require('../../utils/cloud');

Page({
    data: {
        loggingIn: false,
        loginError: '',
    },

    async onShow() {
        const { data: session, error } = await cloud.auth.getSession();
        if (!error && session) {
            getApp().resetSession();
            wx.switchTab({ url: '/pages/index/index' });
        }
    },

    onSignedIn() {
        getApp().resetSession();
        wx.switchTab({ url: '/pages/index/index' });
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
});
