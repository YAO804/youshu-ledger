Page({
    data: {
        formType: 'expense',
        amount: '',
        categoryName: '请选择',
        accountName: '请选择',
        date: '',
        note: '',
        hintText: '',
    },

    onLoad() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        this.setData({ date: now.getFullYear() + '-' + month + '-' + day });
    },

    onTypeChange(event) {
        this.setData({ formType: event.currentTarget.dataset.type, hintText: '' });
    },

    onAmountInput(event) {
        this.setData({ amount: event.detail.value, hintText: '' });
    },

    onNoteInput(event) {
        this.setData({ note: event.detail.value });
    },

    onDateChange(event) {
        this.setData({ date: event.detail.value });
    },

    onPickCategory() {
        wx.showToast({ title: '分类数据待接入', icon: 'none' });
    },

    onPickAccount() {
        wx.showToast({ title: '账户数据待接入', icon: 'none' });
    },

    onSubmit() {
        const amount = Number(this.data.amount);
        if (!amount || amount <= 0) {
            this.setData({ hintText: '请输入大于 0 的金额' });
            return;
        }
        // 数据层接入后：金额转为整数分，写入 record 表，成功后返回明细页。
        this.setData({ hintText: '数据层尚未接入，暂不能保存' });
        wx.showToast({ title: '数据层未接入', icon: 'none' });
    },
});
