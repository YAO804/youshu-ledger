const store = require('./utils/ledger-store');

App({
    globalData: {
        appName: '有数记账',
        storageMode: 'local',
    },

    ensureReady() {
        if (!this.readyPromise) {
            this.readyPromise = store.init();
        }
        return this.readyPromise;
    },
});
