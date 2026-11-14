// 回归测试：云 SDK 不可用或能力残缺时，utils/cloud.js 必须安全降级，
// 数据层门面据此退回本机账本，应用不会白屏。
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const cloudPath = path.join(root, 'utils/cloud.js');
const storePath = path.join(root, 'utils/ledger-store.js');
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

function loadFacade(fakeCloud, available) {
    delete require.cache[storePath];
    const originalLoad = Module._load;
    Module._load = function (request, parent) {
        if (request === './cloud' && parent && parent.filename
            && parent.filename.indexOf(path.join(root, 'utils') + path.sep) === 0) {
            return { cloud: fakeCloud, cloudAvailable: available, cloudError: null };
        }
        return originalLoad.apply(this, arguments);
    };
    try {
        return require(storePath);
    } finally {
        Module._load = originalLoad;
    }
}

function fullClient() {
    return { database: { from() { return {}; } } };
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
check('SDK 缺失时数据面方法仍在', typeof missing.cloud.database.from === 'function');

// 2. 客户端缺少 database.from
const partial = loadCloud({
    createMiniProgramWorkBuddyCloud: () => ({ auth: {} }),
});
check('能力残缺时降级', partial.cloudAvailable === false);
check('能力残缺时数据面方法仍在', typeof partial.cloud.database.from === 'function');

// 3. 完整客户端保持可用
const complete = loadCloud({ createMiniProgramWorkBuddyCloud: fullClient });
check('完整客户端保持可用', complete.cloudAvailable === true);

// 4. 门面按可用性选择共享账本或本机账本
check('SDK 缺失时门面退回本机账本', loadFacade(missing.cloud, false).storageMode === 'local');
check('SDK 可用时门面使用共享账本', loadFacade(fullClient(), true).storageMode === 'shared');

console.log('\nTOTAL PASS ' + passed);
