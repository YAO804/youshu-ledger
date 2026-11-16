const store = require('../../utils/ledger-store');
const {
    AVATAR_CUSTOM, avatarDisplay, avatarEmoji, avatarOptions, nextAvatar,
} = require('../../utils/profile');
const { pickAvatarImage } = require('../../utils/avatar-image');

Page({
    data: {
        // 昵称和头像都是自动生成好的，展示态只读；点「编辑」才进输入态。
        nickname: '',
        nicknameText: '未设置昵称',
        avatar: '',
        avatarData: '',
        avatarEmoji: avatarEmoji(''),
        avatarImage: '',
        draftAvatar: '',
        draftImage: '',
        nicknameInput: '',
        avatarOptions: avatarOptions(),
        editing: false,
        recordCount: 0,
        storageMode: store.mode,
        cloudAvailable: store.cloudAvailable,
        storageText: '两人共享',
        modeHint: '',
        notice: '',
        menuGroups: [
            {
                key: 'basic',
                title: '基础设置',
                items: [
                    { key: 'accounts', text: '支付账户与余额', path: '/pages/accounts/accounts' },
                    { key: 'categories', text: '分类管理', path: '/pages/categories/categories' },
                ],
            },
            {
                key: 'rules',
                title: '记账规则',
                items: [
                    { key: 'budgets', text: '预算与超支提醒', path: '/pages/budgets/budgets' },
                    { key: 'recurring', text: '周期记账规则', path: '/pages/recurring/recurring' },
                ],
            },
            {
                key: 'data',
                title: '数据',
                items: [
                    { key: 'data', text: '账单导入 / 数据导出', path: '/pages/data/data' },
                ],
            },
        ],
    },

    async onShow() {
        const ready = await getApp().ensureReady();
        if (ready.error) {
            wx.showToast({ title: ready.error.message || '初始化失败', icon: 'none' });
            return;
        }
        this.applyStorageState();
        await this.refresh();
        // 降级可能发生在 refresh 里，取完数再同步一次。
        this.applyStorageState();
    },

    // 存储方式可以手动切换，也可能被云端降级改变，所以每次进页面都重算一次。
    applyStorageState() {
        const mode = store.mode;
        const cloudMode = mode === 'cloud';
        const forced = store.notice;
        this.setData({
            storageMode: mode,
            cloudAvailable: store.cloudAvailable,
            storageText: cloudMode ? '两人共享' : '本机账本',
            // 顶部那条黄色说明：有强制降级原因就显示原因，否则显示当前模式的常规说明。
            notice: forced || (cloudMode
                ? '两个人打开就是同一本账，不用注册、不用登录。清空会删除共享账本的全部记录，操作前建议先导出 CSV 备份。'
                : '账目只存在这台手机上，换手机不会带走。清空只会删除本机记录，云端数据不受影响。'),
            modeHint: forced || (cloudMode
                ? '当前使用云端共享账本，两个人的手机看到的是同一份数据。'
                : '当前使用本机账本，数据不会同步到对方的手机，也不会自动上传到云端。'),
        });
    },

    async onModeTap(event) {
        const target = event.currentTarget.dataset.mode;
        if (!target || target === this.data.storageMode) return;

        if (target === 'cloud' && !this.data.cloudAvailable) {
            wx.showModal({
                title: '云端模式不可用',
                content: '云服务组件没有加载起来，只能使用本机账本。\n\n如果是开发者，请先在微信开发者工具执行「工具 → 构建 npm」，再确认云服务域名已配置。',
                showCancel: false,
                confirmText: '知道了',
            });
            return;
        }

        wx.showModal({
            title: target === 'cloud' ? '切换到云端共享' : '切换到本机账本',
            content: target === 'cloud'
                ? '切换后看到的是云端共享账本。本机账本里的账目不会自动上传，需要先在数据页导出 CSV，切换后再导入。确认切换？'
                : '切换后看到的是本机账本，云端数据不会被删除，随时可以切回来。确认切换？',
            confirmText: '切换',
            success: async (res) => {
                if (!res.confirm) return;
                await this.doSwitchMode(target);
            },
        });
    },

    async doSwitchMode(target) {
        wx.showLoading({ title: '切换中…', mask: true });
        const { error } = await store.setMode(target);
        wx.hideLoading();

        if (error) {
            // 探测没通过时不改状态，明确告诉用户只能用本机。
            wx.showModal({
                title: '无法切换到云端模式',
                content: error.message + '\n\n开发者需要把 mp-api.app.workbuddy.host 加入小程序后台的 request 合法域名。',
                showCancel: false,
                confirmText: '知道了',
            });
            this.applyStorageState();
            return;
        }

        // 换了存储方式就要重新 init，页面栈里其他页会分别在 onShow 时刷新。
        const app = getApp();
        app.resetReady();
        const ready = await app.ensureReady();
        if (ready.error) {
            wx.showToast({ title: ready.error.message || '初始化失败', icon: 'none' });
            return;
        }

        this.applyStorageState();
        await this.refresh();
        wx.showToast({ title: target === 'cloud' ? '已切换到云端' : '已切换到本机', icon: 'success' });
    },

    async refresh() {
        const { data, error } = await store.getProfile();
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        const patch = {
            nickname: data.nickname,
            nicknameText: data.nicknameText,
            avatar: data.avatar,
            avatarData: data.avatarData,
            recordCount: data.recordCount,
        };
        // 正在编辑时不要把用户没保存的输入（含头像预览）冲掉。
        if (!this.data.editing) {
            patch.nicknameInput = data.nickname;
            patch.draftAvatar = data.avatar;
            patch.draftImage = data.avatarData;
            patch.avatarEmoji = data.avatarEmoji;
            patch.avatarImage = data.avatarImage;
        }
        this.setData(patch);
    },

    onEditStart() {
        if (this.data.editing) return;
        const display = avatarDisplay(this.data.avatar, this.data.avatarData);
        this.setData({
            editing: true,
            nicknameInput: this.data.nickname,
            draftAvatar: this.data.avatar,
            draftImage: this.data.avatarData,
            avatarEmoji: display.emoji,
            avatarImage: display.image,
        });
    },

    onCancelEdit() {
        const display = avatarDisplay(this.data.avatar, this.data.avatarData);
        this.setData({
            editing: false,
            nicknameInput: this.data.nickname,
            draftAvatar: this.data.avatar,
            draftImage: this.data.avatarData,
            avatarEmoji: display.emoji,
            avatarImage: display.image,
        });
    },

    onNicknameInput(event) {
        this.setData({ nicknameInput: event.detail.value });
    },

    // 编辑态点头像就是「换下一个」，展示态点头像进编辑；上传的图不参与轮换。
    onAvatarTap() {
        if (!this.data.editing) {
            this.onEditStart();
            return;
        }
        if (this.data.draftAvatar === AVATAR_CUSTOM) return;
        this.applyDraftAvatar(nextAvatar(this.data.draftAvatar));
    },

    onPickAvatar(event) {
        const key = event.currentTarget.dataset.key;
        if (!key) return;
        this.applyDraftAvatar(key);
    },

    applyDraftAvatar(key) {
        this.setData({
            draftAvatar: key,
            draftImage: '',
            avatarEmoji: avatarEmoji(key),
            avatarImage: '',
        });
    },

    // 从相册或相机选一张，裁成 240x240 后以 data URI 预览，保存时才落库。
    async onChooseAvatar() {
        if (this.choosingAvatar) return;
        this.choosingAvatar = true;
        wx.showLoading({ title: '处理中…', mask: true });
        const { data, error } = await pickAvatarImage();
        wx.hideLoading();
        this.choosingAvatar = false;
        if (error) {
            if (error.code !== 'CANCELLED') {
                wx.showToast({ title: error.message || '选图失败', icon: 'none' });
            }
            return;
        }
        this.setData({
            draftAvatar: AVATAR_CUSTOM,
            draftImage: data,
            avatarEmoji: '',
            avatarImage: data,
        });
    },

    async onSaveNickname() {
        const nickname = String(this.data.nicknameInput || '').trim();
        if (!nickname) {
            wx.showToast({ title: '昵称不能为空', icon: 'none' });
            return;
        }
        wx.showLoading({ title: '保存中…', mask: true });
        const { error } = await store.setProfile({
            nickname,
            avatar: this.data.draftAvatar,
            avatarData: this.data.draftImage,
        });
        wx.hideLoading();
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({ editing: false });
        await this.refresh();
        wx.showToast({ title: '已保存', icon: 'success' });
    },

    onMenuTap(event) {
        const path = event.currentTarget.dataset.path;
        if (!path) {
            wx.showToast({ title: '功能暂未开放', icon: 'none' });
            return;
        }
        wx.navigateTo({
            url: path,
            fail: () => wx.showToast({ title: '页面暂未开放', icon: 'none' }),
        });
    },

    onReset() {
        wx.showModal({
            title: '清空全部数据',
            content: this.data.storageMode === 'cloud'
                ? '共享账本里的所有账目、账户、分类、预算和周期规则都会被删除，且无法恢复。建议先导出备份。确认清空？'
                : '本机所有账目、账户、分类、预算和周期规则都会被删除，且无法恢复。建议先导出备份。确认清空？',
            confirmText: '确认清空',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) return;
                const { error } = await store.resetAll();
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已清空', icon: 'success' });
                await this.refresh();
            },
        });
    },
});
