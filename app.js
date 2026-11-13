const { cloud } = require('./utils/cloud');
const store = require('./utils/ledger-store');

App({
    globalData: {
        appName: '有数记账',
    },

    onShow(options) {
        // 完整 options 先交给 SDK 处理 WorkBuddy 小程序原生授权回调。
        // 不阻塞启动：没有回调时 SDK 也会安全返回。
        if (typeof cloud.auth.handleWorkBuddyMiniProgramCallback !== 'function') return;
        Promise.resolve(cloud.auth.handleWorkBuddyMiniProgramCallback(options))
            .then(() => {
                store.resetMode();
                this.readyPromise = null;
            })
            .catch(() => {});
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
