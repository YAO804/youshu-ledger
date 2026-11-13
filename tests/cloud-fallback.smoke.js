// 回归测试：预览器 / H5 模拟环境下云 SDK 不可用或能力残缺时，
// utils/cloud.js 必须降级为完整 stub，且不能让 App 生命周期里出现「xxx is not a function」。
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const cloudPath = path.join(root, 'utils/cloud.js');
const SDK_ID = '@tencent-ai/workbuddy-cloud-sdk/miniprogram';

const minimalWx = {
    getStorageSync: () => '',
    setStorageSync() {},
    removeStorageSync() {},
    request() { return { abort() {} }; },
};

function loadCloud(sdkModule) {
    delete require.cache[cloudPath];
    const originalLoad = Module._load;
    const originalWx = global.wx;
    global.wx = minimalWx;
    Module._load = function (request) {
        if (request === SDK_ID) {
            if (sdkModule === null) throw new Error('Cannot find module ' + SDK_ID);
            return sdkModule;
        }
        return originalLoad.apply(this, arguments);
    };
    try {
        return require(cloudPath);
    } finally {
        Module._load = originalLoad;
        if (originalWx === undefined) delete global.wx;
        else global.wx = originalWx;
    }
}

function fullClient() {
    return {
        auth: {
            getSession: async () => ({ data: null, error: null }),
            handleWorkBuddyMiniProgramCallback: async () => ({ data: null, error: null }),
            signOut: async () => ({ error: null }),
        },
        database: { from() { return {}; } },
    };
}

let passed = 0;
function check(name, condition) {
    if (condition) {
        passed += 1;
        console.log('PASS ' + name);
    } else {
        console.log('FAIL ' + name);
        process.exitCode = 1;
    }
}

// 1. SDK 模块根本不存在（未构建 miniprogram_npm）
const missing = loadCloud(null);
check('SDK 缺失时降级', missing.cloudAvailable === false);
check('SDK 缺失时 getSession 可用', typeof missing.cloud.auth.getSession === 'function');
check('SDK 缺失时授权回调方法可用', typeof missing.cloud.auth.handleWorkBuddyMiniProgramCallback === 'function');

// 2. SDK 能创建客户端，但缺少小程序专属授权方法（预览器 / 残缺 SDK）
const partial = loadCloud({
    createMiniProgramWorkBuddyCloud: () => ({
        auth: { getSession: async () => ({ data: null, error: null }) },
        database: { from() { return {}; } },
    }),
});
check('能力残缺时降级', partial.cloudAvailable === false);
check('能力残缺时授权回调方法仍可用', typeof partial.cloud.auth.handleWorkBuddyMiniProgramCallback === 'function');

// 3. 完整客户端应保持可用
const complete = loadCloud({ createMiniProgramWorkBuddyCloud: fullClient });
check('完整客户端保持可用', complete.cloudAvailable === true);

console.log('\nTOTAL PASS ' + passed);
