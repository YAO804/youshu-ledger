// 回归测试：分类明细的排序必须都对，且「依据 + 方向」两个维度能正确换算成排序 key。
const path = require('path');

const root = path.resolve(__dirname, '..');
const {
    SORT_FIELDS, DEFAULT_FIELD, DEFAULT_ORDER, DEFAULT_SORT,
    orderOptions, toSortKey, parseSortKey, sortRecords, isValidSort,
} = require(path.join(root, 'utils/record-sort.js'));

let passed = 0;
function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        console.log('PASS ' + name);
    } else {
        console.log('FAIL ' + name + (detail === undefined ? '' : ' -> ' + JSON.stringify(detail)));
        process.exitCode = 1;
    }
}

const rows = [
    { id: 'a', occurredAt: '2026-11-03', amount: 3550, createdAt: 100 },
    { id: 'b', occurredAt: '2026-11-16', amount: 1200, createdAt: 200 },
    { id: 'c', occurredAt: '2026-11-08', amount: 38800, createdAt: 300 },
    { id: 'd', occurredAt: '2026-11-16', amount: 300, createdAt: 400 },
];

function ids(list) {
    return list.map((row) => row.id).join(',');
}

// 两个维度：依据（时间/金额）+ 方向（desc/asc）
check('两个排序依据', SORT_FIELDS.length === 2, SORT_FIELDS.map((f) => f.key));
check('默认按时间倒序', DEFAULT_FIELD === 'time' && DEFAULT_ORDER === 'desc' && DEFAULT_SORT === 'time-desc');

check('时间的方向文案', orderOptions('time').map((o) => o.label).join('/') === '最新在前/最早在前', orderOptions('time'));
check('金额的方向文案', orderOptions('amount').map((o) => o.label).join('/') === '从高到低/从低到高', orderOptions('amount'));
check('未知依据按时间处理', orderOptions('foo').map((o) => o.key).join(',') === 'desc,asc');

check('换算 key：时间倒序', toSortKey('time', 'desc') === 'time-desc');
check('换算 key：金额正序', toSortKey('amount', 'asc') === 'amount-asc');
check('换算 key：非法值回落', toSortKey('x', 'y') === 'time-desc');
check('解析 key：金额正序', JSON.stringify(parseSortKey('amount-asc')) === JSON.stringify({ field: 'amount', order: 'asc' }));
check('解析 key：非法输入回落', JSON.stringify(parseSortKey('')) === JSON.stringify({ field: 'time', order: 'desc' }));
check('合法 key 校验', isValidSort('amount-asc') && !isValidSort('foo'));

check('时间倒序：最新在前', ids(sortRecords(rows, 'time-desc')) === 'd,b,c,a', ids(sortRecords(rows, 'time-desc')));
check('时间正序：最早在前', ids(sortRecords(rows, 'time-asc')) === 'a,c,b,d', ids(sortRecords(rows, 'time-asc')));
check('金额倒序：多的在前', ids(sortRecords(rows, 'amount-desc')) === 'c,a,b,d', ids(sortRecords(rows, 'amount-desc')));
check('金额正序：少的在前', ids(sortRecords(rows, 'amount-asc')) === 'd,b,a,c', ids(sortRecords(rows, 'amount-asc')));

check('未知 key 退回时间倒序', ids(sortRecords(rows, 'whatever')) === 'd,b,c,a', ids(sortRecords(rows, 'whatever')));
check('不篡改入参顺序', ids(rows) === 'a,b,c,d', ids(rows));

// 同一天同一金额：用 createdAt 兜底，保证顺序稳定可复现
const sameDay = [
    { id: 'x', occurredAt: '2026-11-16', amount: 500, createdAt: 2 },
    { id: 'y', occurredAt: '2026-11-16', amount: 500, createdAt: 1 },
];
check('同日期同金额顺序稳定', ids(sortRecords(sameDay, 'time-desc')) === 'x,y', ids(sortRecords(sameDay, 'time-desc')));
check('同日期同金额正序也稳定', ids(sortRecords(sameDay, 'time-asc')) === 'y,x', ids(sortRecords(sameDay, 'time-asc')));

// 空数据安全
check('空数组不报错', sortRecords([], 'amount-desc').length === 0);
check('undefined 不报错', sortRecords(undefined, 'time-asc').length === 0);

// 缺字段的记录不应产生 NaN 比较
const partial = [{ id: 'p' }, { id: 'q', amount: 100, occurredAt: '2026-11-02' }];
const sortedPartial = sortRecords(partial, 'amount-desc');
check('缺字段仍可排序', sortedPartial.length === 2 && sortedPartial[0].id === 'q', sortedPartial.map((r) => r.id));

console.log('\nTOTAL PASS ' + passed);
