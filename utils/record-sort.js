// 分类详情页的排序规则。纯函数，不依赖 wx，便于单测。
// 记录上的 occurredAt 是 YYYY-MM-DD，可以直接按字符串比较；金额是整数分。
//
// 界面上拆成两个维度（依据 + 方向），比四个平铺选项更好懂：
//   依据：按时间 / 按金额
//   方向：最新在前·最早在前  或  从高到低·从低到高
// 最终归一成 'time-desc' 这类 key 交给 sortRecords。

const SORT_FIELDS = [
    { key: 'time', label: '按时间' },
    { key: 'amount', label: '按金额' },
];

const DEFAULT_FIELD = 'time';
const DEFAULT_ORDER = 'desc';
const DEFAULT_SORT = 'time-desc';

// 方向文案跟着依据变，避免「倒序」这种抽象说法。
function orderOptions(field) {
    return field === 'amount'
        ? [{ key: 'desc', label: '从高到低' }, { key: 'asc', label: '从低到高' }]
        : [{ key: 'desc', label: '最新在前' }, { key: 'asc', label: '最早在前' }];
}

function toSortKey(field, order) {
    return (field === 'amount' ? 'amount' : 'time') + '-' + (order === 'asc' ? 'asc' : 'desc');
}

function parseSortKey(key) {
    if (typeof key !== 'string') return { field: DEFAULT_FIELD, order: DEFAULT_ORDER };
    const parts = key.split('-');
    return {
        field: parts[0] === 'amount' ? 'amount' : 'time',
        order: parts[1] === 'asc' ? 'asc' : 'desc',
    };
}

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
    return key === 'time-desc' || key === 'time-asc' || key === 'amount-desc' || key === 'amount-asc';
}

module.exports = {
    SORT_FIELDS, DEFAULT_FIELD, DEFAULT_ORDER, DEFAULT_SORT,
    orderOptions, toSortKey, parseSortKey, sortRecords, isValidSort,
};
