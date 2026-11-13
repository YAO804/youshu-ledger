const { cloud } = require('./utils/cloud');
const store = require('./utils/ledger-store');

App({
    globalData: {
        appName: '有数记账',
        storageMode: 'cloud',
    },

    onShow(options) {
        // 完整 options 必须先交给 SDK 处理 WorkBuddy 小程序授权回调，
        // 再执行任何登录门禁或受保护查询。
        this.authReady = (async () => {
            const callback = await cloud.auth.handleWorkBuddyMiniProgramCallback(options);
            if (callback.error) return callback;
            return cloud.auth.getSession();
        })();
    },

    ensureReady() {
        if (!this.authReady) {
            this.authReady = cloud.auth.getSession();
        }
        if (!this.readyPromise) {
            this.readyPromise = (async () => {
                const session = await this.authReady;
                if (!session || session.error || !session.data) {
                    return { data: null, error: { code: 'UNAUTHENTICATED', message: '请先登录' } };
                }
                return store.init();
            })();
        }
        return this.readyPromise;
    },

    resetSession() {
        this.authReady = null;
        this.readyPromise = null;
    },
});
