Page({
    data: {
        avatarText: '?',
        nickname: '未登录',
        householdName: '家庭共享账本',
        menuGroups: [
            {
                key: 'household',
                title: '账本与成员',
                items: [
                    { key: 'members', text: '家庭成员与邀请' },
                    { key: 'accounts', text: '支付账户与余额' },
                    { key: 'categories', text: '分类管理' },
                ],
            },
            {
                key: 'settings',
                title: '记账设置',
                items: [
                    { key: 'budgets', text: '预算与超支提醒' },
                    { key: 'recurring', text: '周期记账规则' },
                ],
            },
            {
                key: 'data',
                title: '数据',
                items: [
                    { key: 'import', text: '账单导入' },
                    { key: 'export', text: '数据导出' },
                ],
            },
        ],
    },

    onMenuTap() {
        wx.showToast({ title: '数据层接入后开放', icon: 'none' });
    },
});
