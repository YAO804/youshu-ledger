// 唯一 SDK 客户端初始化点。
// 顶层不强制依赖 npm 构建产物：未构建 miniprogram_npm 时小程序也必须能启动，
// 此时应用自动进入「本地试用」模式，登录与云同步能力降级为不可用（由门面判断）。

const publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_rQutRVl8y6TyBzhTNY208C_uPCsnvt4khNeccSlW7uSMiG4Wc70LMbi',
    workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_rQutRVl8y6TyBzhTNY208C',
};

const UNAVAILABLE = '云服务组件未加载，当前为本地试用模式';

function makeStub(reason) {
    const unavailable = () => ({ data: null, error: { kind: 'SDK_UNAVAILABLE', message: reason || UNAVAILABLE } });
    return {
        auth: {
            getSession: async () => ({ data: null, error: null }),
            sendOtp: unavailable,
            verifyOtp: unavailable,
            signInWithOtp: unavailable,
            signInWithWorkBuddyMiniProgram: unavailable,
            handleWorkBuddyMiniProgramCallback: async () => ({ data: null, error: null }),
            signOut: async () => ({ data: null, error: null }),
        },
        database: {
            from() {
                throw new Error(reason || UNAVAILABLE);
            },
        },
    };
}

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
    // 预览器 / H5 模拟环境可能给出能力残缺的客户端。缺任一核心方法就整体降级，
    // 避免后续生命周期里出现「xxx is not a function」。
    const auth = client && client.auth;
    if (!auth || typeof auth.getSession !== 'function'
        || typeof auth.handleWorkBuddyMiniProgramCallback !== 'function'
        || !client.database || typeof client.database.from !== 'function') {
        throw new Error('云 SDK 客户端能力不完整（可能处于非原生小程序运行环境）');
    }
    cloud = client;
    cloudAvailable = true;
} catch (error) {
    cloudError = error;
    cloud = makeStub((error && error.message) || UNAVAILABLE);
}

module.exports = { cloud, cloudAvailable, cloudError };
