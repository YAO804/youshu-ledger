// 唯一 SDK 客户端初始化点。
// 顶层不强制依赖 npm 构建产物：未构建 miniprogram_npm 时小程序也必须能启动，
// 此时数据层门面会自动退回本机账本。
const publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_rQutRVl8y6TyBzhTNY208C_uPCsnvt4khNeccSlW7uSMiG4Wc70LMbi',
    workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_rQutRVl8y6TyBzhTNY208C',
};

const UNAVAILABLE = '云服务组件未加载，已切换为本机账本';

let cloud = null;
let cloudAvailable = false;
let cloudError = null;

try {
    const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
    const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');

    const client = createMiniProgramWorkBuddyCloud({
        endpoint: publicConfig.endpoint,
        publishableKey: publicConfig.publishableKey,
        workBuddyOAuthClientId: publicConfig.workBuddyOAuthClientId,
        wx: createDiagnosticWx(wx),
    });
    if (!client || !client.database || typeof client.database.from !== 'function') {
        throw new Error('云 SDK 客户端缺少 database.from');
    }
    cloud = client;
    cloudAvailable = true;
} catch (error) {
    cloudError = error;
    cloud = {
        database: {
            from() {
                throw new Error((error && error.message) || UNAVAILABLE);
            },
        },
    };
}

module.exports = { cloud, cloudAvailable, cloudError };
