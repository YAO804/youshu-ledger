const store = require('../../utils/ledger-store');
const { fromCents, currentMonth } = require('../../utils/format');
const {
    SORT_FIELDS, DEFAULT_FIELD, DEFAULT_ORDER, DEFAULT_SORT,
    orderOptions, toSortKey, parseSortKey, sortRecords, isValidSort,
} = require('../../utils/record-sort');

// 小程序可能已经把 query 解过一次码，这里不能盲目再解，遇到不合法的 % 要回落原值。
function safeDecode(value) {
    if (!value) return '';
    try {
        return decodeURIComponent(value);
    } catch (e) {
        return String(value);
    }
}

// 只把要展示的字段放进 data，原始记录留在页面实例上，切换排序时不用重新请求。
function toRow(record) {
    return {
        id: record.id,
        dateText: record.dateText || String(record.occurredAt || '').slice(5),
        accountName: record.accountName || '未指定',
        noteText: record.noteText || '',
        amountText: fromCents(record.amount || 0),
    };
}

Page({
    data: {
        month: '',
        monthLabel: '',
        categoryId: '',
        categoryName: '分类',
        type: 'expense',
        typeText: '支出',
        sortKey: DEFAULT_SORT,
        sortField: DEFAULT_FIELD,
        sortOrder: DEFAULT_ORDER,
        sortFields: SORT_FIELDS,
        orderOptions: orderOptions(DEFAULT_FIELD),
        rows: [],
        recordCount: 0,
        totalText: '0.00',
        avgText: '0.00',
        percentText: '0%',
        viewState: 'loading',
        errorText: '',
    },

    onLoad(query) {
        const month = query.month || currentMonth();
        const type = query.type === 'income' ? 'income' : 'expense';
        const categoryName = query.name ? safeDecode(query.name) : '分类';
        const sortKey = isValidSort(query.sort) ? query.sort : DEFAULT_SORT;
        const parsed = parseSortKey(sortKey);

        this.rawRecords = [];

        this.setData({
            month,
            monthLabel: month.slice(0, 4) + ' 年 ' + Number(month.slice(5, 7)) + ' 月',
            categoryId: query.categoryId ? safeDecode(query.categoryId) : '',
            categoryName,
            type,
            typeText: type === 'income' ? '收入' : '支出',
            sortKey,
            sortField: parsed.field,
            sortOrder: parsed.order,
            orderOptions: orderOptions(parsed.field),
        });

        wx.setNavigationBarTitle({ title: categoryName + ' 明细' });
    },

    async onShow() {
        const ready = await getApp().ensureReady();
        if (ready.error) {
            wx.showToast({ title: ready.error.message || '初始化失败', icon: 'none' });
            return;
        }
        await this.load();
    },

    async load() {
        this.setData({ viewState: 'loading' });
        const { data, error } = await store.getMonthOverview(this.data.month);
        if (error) {
            this.setData({ viewState: 'error', errorText: error.message });
            return;
        }

        const target = this.data.type;
        const typed = (data.records || []).filter((row) => row.type === target);
        const matched = this.data.categoryId
            ? typed.filter((row) => String(row.categoryId || '') === this.data.categoryId)
            : typed;

        const total = matched.reduce((sum, row) => sum + (row.amount || 0), 0);
        const monthTotal = target === 'income' ? (data.income || 0) : (data.expense || 0);

        this.rawRecords = matched;
        this.setData({
            viewState: 'ready',
            recordCount: matched.length,
            totalText: fromCents(total),
            avgText: matched.length ? fromCents(Math.round(total / matched.length)) : '0.00',
            percentText: (monthTotal > 0 ? Math.round((total / monthTotal) * 100) : 0) + '%',
        });
        this.applySort();
    },

    applySort() {
        const sorted = sortRecords(this.rawRecords, this.data.sortKey);
        this.setData({ rows: sorted.map(toRow) });
    },

    // 换依据时方向保持不变（时间·倒序 → 金额·从高到低），符合直觉。
    onFieldTap(event) {
        const field = event.currentTarget.dataset.key;
        if (!field || field === this.data.sortField) return;
        this.setData({
            sortField: field,
            orderOptions: orderOptions(field),
            sortKey: toSortKey(field, this.data.sortOrder),
        });
        this.applySort();
    },

    onOrderTap(event) {
        const order = event.currentTarget.dataset.key;
        if (!order || order === this.data.sortOrder) return;
        this.setData({
            sortOrder: order,
            sortKey: toSortKey(this.data.sortField, order),
        });
        this.applySort();
    },

    onDeleteRecord(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '删除账目',
            content: '删除后无法恢复，确认删除？',
            confirmColor: '#d9534f',
            success: async (res) => {
                if (!res.confirm) return;
                const { error } = await store.removeRecord(id);
                if (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已删除', icon: 'success' });
                await this.load();
            },
        });
    },
});
