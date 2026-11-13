const store = require('./utils/ledger-store');

App({
    globalData: {
        appName: '有数记账',
    },

    // 只保存启动参数，不在这里调用任何云 SDK 方法。
    // 预览器 / H5 的生命周期模拟不具备小程序原生授权 API，
    // 在 App.onShow 里直接调用会导致「页面生命周期未能完整模拟」。
    onShow(options) {
        this.launchOptions = options || null;
    },

    // 两种模式都能初始化成功：云端模式走云 init，本地试用模式走本地 init。
    ensureReady() {
        if (!this.readyPromise) {
            this.readyPromise = store.init().then(
                (res) => res,
                (e) => ({ data: null, error: { code: 'INIT_FAILED', message: (e && e.message) || '初始化失败' } })
            );
        }
        return this.readyPromise;
    },

    resetSession() {
        store.resetMode();
        this.readyPromise = null;
    },
});
