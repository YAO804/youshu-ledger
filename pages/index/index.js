Page({
    data: {
        monthLabel: '',
        incomeText: '0.00',
        expenseText: '0.00',
        balanceText: '0.00',
        recordCount: 0,
        records: [],
        viewState: 'empty',
        errorText: '',
    },

    onLoad() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        this.setData({ monthLabel: now.getFullYear() + '-' + month });
    },

    onShow() {
        // 数据层接入后：读取当月账目与汇总，格式化金额后 setData。
    },
});
