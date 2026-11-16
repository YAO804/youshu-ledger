// 账目删除的统一入口：概览页和记一笔页共用同一套确认文案与错误处理。
// record-list 组件只抛 id，页面拿到 id 走这里，避免两处各写一份弹窗。
const store = require('./ledger-store');

// 返回 true 表示确实删掉了，调用方据此决定是否重新拉数据。
function confirmRemoveRecord(id) {
    return new Promise((resolve) => {
        if (!id) {
            resolve(false);
            return;
        }
        wx.showModal({
            title: '删除账目',
            content: '删除后无法恢复，确认删除？',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) {
                    resolve(false);
                    return;
                }
                const { error } = await store.removeRecord(id);
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    resolve(false);
                    return;
                }
                wx.showToast({ title: '已删除', icon: 'success' });
                resolve(true);
            },
            fail: () => resolve(false),
        });
    });
}

module.exports = { confirmRemoveRecord };
