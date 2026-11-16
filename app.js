const store = require('./utils/ledger-store');

App({
    globalData: {
        appName: '有数记账',
        storageMode: store.storageMode,
    },

    // 共享账本和本机账本都走同一个 init，页面无需区分。
    ensureReady() {
        if (!this.readyPromise) {
            this.readyPromise = store.init().then(
                (res) => res,
                (e) => ({ data: null, error: { code: 'INIT_FAILED', message: (e && e.message) || '初始化失败' } })
            );
        }
        return this.readyPromise;
    },

    // 切换存储方式后要重新 init，否则用的还是上一个模式的结果。
    resetReady() {
        this.readyPromise = null;
        this.globalData.storageMode = store.storageMode;
    },
});
