const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');

// 来自 workbuddy_cloud_service activate 返回的 publicConfig。
// 这几个是面向终端用户的公开配置，可放在小程序源码中；服务端密钥不会下发。
const publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_rQutRVl8y6TyBzhTNY208C_uPCsnvt4khNeccSlW7uSMiG4Wc70LMbi',
    workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_rQutRVl8y6TyBzhTNY208C',
};

const cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    workBuddyOAuthClientId: publicConfig.workBuddyOAuthClientId,
    wx: createDiagnosticWx(wx),
});

module.exports = { cloud };
