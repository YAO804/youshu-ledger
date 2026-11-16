// 分类详情页的排序规则。纯函数，不依赖 wx，便于单测。
// 记录上的 occurredAt 是 YYYY-MM-DD，可以直接按字符串比较；金额是整数分。

const SORT_OPTIONS = [
    { key: 'time-desc', label: '最新在前', group: '时间' },
    { key: 'time-asc', label: '最早在前', group: '时间' },
    { key: 'amount-desc', label: '金额从高到低', group: '金额' },
    { key: 'amount-asc', label: '金额从低到高', group: '金额' },
];

const DEFAULT_SORT = 'time-desc';

function dateText(record) {
    return String(record && record.occurredAt ? record.occurredAt : '');
}

// 同一天同一金额时用 createdAt 兜底，保证顺序稳定、不会每次刷新都变。
function timeAsc(a, b) {
    return dateText(a).localeCompare(dateText(b)) || (a.createdAt || 0) - (b.createdAt || 0);
}

function timeDesc(a, b) {
    return dateText(b).localeCompare(dateText(a)) || (b.createdAt || 0) - (a.createdAt || 0);
}

function amountDesc(a, b) {
    return (b.amount || 0) - (a.amount || 0) || timeDesc(a, b);
}

function amountAsc(a, b) {
    return (a.amount || 0) - (b.amount || 0) || timeDesc(a, b);
}

function comparatorOf(key) {
    if (key === 'time-asc') return timeAsc;
    if (key === 'amount-desc') return amountDesc;
    if (key === 'amount-asc') return amountAsc;
    return timeDesc;
}

// 不修改入参，返回新数组。
function sortRecords(records, key) {
    const rows = (records || []).slice();
    rows.sort(comparatorOf(key));
    return rows;
}

function isValidSort(key) {
    return SORT_OPTIONS.some((item) => item.key === key);
}

module.exports = { SORT_OPTIONS, DEFAULT_SORT, sortRecords, isValidSort };
