// 测试样例数据。只在「我的 → 账单导入 / 数据导出」里手动点击时写入，
// 正常记账流程不会引用本文件。
//
// 设计目标是把界面上的边界都点亮，方便肉眼回归：
//   · 近 6 个月趋势里有一个空月份、一个负结余月、一个刚好收支平衡的月
//   · 本月总预算与「餐饮」分类预算都故意设成超支，上月预算设成不超支
//   · 覆盖全部预置分类 + 3 个自定义分类（宠物 / 旅行 / 红包），其中「旅行」零流水零预算
//   · 金额边界：0.01 元、带千分位的 1,299.00、上万房租
//   · 备注边界：空、含逗号、含换行、超长中文
//   · 账户边界：信用卡负余额、有初始余额但无流水的储蓄卡、默认账户
//   · 两条周期规则：一条启用、一条停用
//
// 记录里的月份用「相对当前月的偏移」表示，避免写死日期后过了几个月就全部失效。
const { pad, currentMonth, shiftMonth } = require('./format');

const ACCOUNTS = [
    { name: '信用卡', type: 'credit', initialBalance: 0 },
    { name: '储蓄卡', type: 'bank', initialBalance: 500000 },
];

const CATEGORIES = [
    { name: '宠物', type: 'expense' },
    { name: '旅行', type: 'expense' },
    { name: '红包', type: 'income' },
];

// [月份偏移, 日, 收支, 金额, 分类, 账户, 备注]
const RECORDS = [
    // 本月：预算超支 + 全分类覆盖
    [0, 1, 'income', '8500.00', '工资', '银行卡', '月薪'],
    [0, 2, 'expense', '3200.00', '居住', '银行卡', '房租'],
    [0, 3, 'expense', '35.50', '餐饮', '微信', '午餐'],
    [0, 4, 'expense', '6.00', '交通', '支付宝', '地铁'],
    [0, 5, 'expense', '268.00', '购物', '支付宝', '卫衣,裤子,帽子'],
    [0, 6, 'expense', '9.90', '日用', '微信', '纸巾和垃圾袋，这条备注故意写得很长，用来测试备注文字会不会把左边的日期和右边的金额挤出屏幕'],
    [0, 7, 'income', '128.36', '理财', '银行卡', '余额宝收益'],
    [0, 8, 'expense', '388.00', '娱乐', '信用卡', 'KTV'],
    [0, 9, 'expense', '0.01', '医疗', '微信', '挂号费'],
    [0, 10, 'expense', '199.00', '教育', '支付宝', '电子书年费'],
    [0, 11, 'expense', '520.00', '人情', '微信', '生日礼物'],
    [0, 12, 'expense', '128.00', '餐饮', '微信', '火锅'],
    [0, 13, 'expense', '25.00', '交通', '支付宝', '打车'],
    [0, 14, 'income', '1200.00', '奖金', '银行卡', '季度奖'],
    [0, 15, 'expense', '156.00', '宠物', '微信', '猫粮\n猫砂'],
    [0, 16, 'expense', '12.00', '餐饮', '支付宝', '早餐'],
    [0, 16, 'expense', '3.00', '日用', '默认账户', ''],

    // 上月：收支刚好打平，预算不超支，含月末最后一笔
    [-1, 1, 'income', '2000.00', '兼职', '支付宝', '外快'],
    [-1, 5, 'expense', '1200.00', '购物', '支付宝', '换季衣服'],
    [-1, 11, 'expense', '500.00', '餐饮', '微信', '聚餐'],
    [-1, 20, 'expense', '212.00', '交通', '微信', '打车和公交'],
    [-1, 31, 'expense', '88.00', '其他', '微信', '月末清账'],

    // 上上月：故意留空，用来验证零数据月份的概览、统计与趋势柱
    // 第三个月：支出远大于收入，结余率为负
    [-3, 1, 'income', '8000.00', '工资', '银行卡', '月薪'],
    [-3, 2, 'expense', '3200.00', '居住', '银行卡', '房租'],
    [-3, 6, 'expense', '2800.00', '教育', '支付宝', '线上课程'],
    [-3, 10, 'expense', '3688.00', '购物', '信用卡', '笔记本电脑'],
    [-3, 14, 'expense', '46.00', '餐饮', '微信', '午饭'],

    // 第四个月：带千分位的金额
    [-4, 1, 'income', '8500.00', '工资', '银行卡', '月薪'],
    [-4, 3, 'expense', '3200.00', '居住', '银行卡', '房租'],
    [-4, 15, 'expense', '1,299.00', '购物', '支付宝', '扫地机器人'],
    [-4, 18, 'expense', '6.00', '交通', '微信', '地铁'],
    [-4, 22, 'expense', '235.50', '医疗', '微信', '感冒药'],
    [-4, 28, 'expense', '600.00', '人情', '微信', '同事婚礼红包'],

    // 第五个月：正常月份
    [-5, 5, 'income', '8500.00', '工资', '银行卡', '月薪'],
    [-5, 8, 'expense', '3200.00', '居住', '银行卡', '房租'],
    [-5, 12, 'expense', '58.00', '餐饮', '微信', '午饭'],
    [-5, 20, 'expense', '128.00', '娱乐', '支付宝', '电影票'],
    [-5, 28, 'expense', '39.90', '日用', '微信', '洗衣液和柔顺剂'],

    // 半年前：落在「近 6 个月」窗口之外，用来验证切月与趋势窗口边界
    [-6, 10, 'income', '500.00', '红包', '微信', '长辈给的红包'],
    [-6, 11, 'expense', '260.00', '宠物', '微信', '宠物医院'],
];

// 预算：月份同样用相对偏移，分类按名字在写入时解析成 id。
const BUDGETS = [
    { month: 0, categoryName: '', amountCents: 450000 },
    { month: 0, categoryName: '餐饮', amountCents: 15000 },
    { month: -1, categoryName: '', amountCents: 300000 },
];

const RECURRING = [
    { title: '房租', type: 'expense', amountCents: 320000, categoryName: '居住', accountName: '银行卡', day: 1, note: '每月房租', enabled: true },
    { title: '视频会员', type: 'expense', amountCents: 2500, categoryName: '娱乐', accountName: '支付宝', day: 15, note: '包月会员', enabled: false },
];

function daysInMonth(month) {
    return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

// 偏移 -1 的「31 号」在 2 月会被夹到月末，避免生成非法日期。
function dateOf(offset, day) {
    const month = shiftMonth(currentMonth(), offset);
    return month + '-' + pad(Math.min(Math.max(day, 1), daysInMonth(month)));
}

function csvCell(value) {
    return '"' + String(value === undefined || value === null ? '' : value).replace(/"/g, '""') + '"';
}

// 走 CSV 导入，一次批量写完，云端模式也只有一次往返。
function buildCsv() {
    const lines = [['日期', '收支', '金额', '分类', '账户', '备注'].map(csvCell).join(',')];
    RECORDS.forEach((row) => {
        lines.push([
            dateOf(row[0], row[1]),
            row[2] === 'income' ? '收入' : '支出',
            row[3],
            row[4],
            row[5],
            row[6],
        ].map(csvCell).join(','));
    });
    return lines.join('\r\n');
}

function ok(data) {
    return { data, error: null };
}

// 先清空再写入，保证每次点都是同一份可预期的数据，不会叠加重复账目。
async function seedSampleData(store) {
    const reset = await store.resetAll();
    if (reset.error) return reset;

    // 清空后默认账户、分类、档案需要重新铺一遍。
    const ready = await store.init();
    if (ready.error) return ready;

    const accountList = await store.getAccounts();
    if (accountList.error) return accountList;
    for (const item of ACCOUNTS) {
        if (accountList.data.some((row) => row.name === item.name)) continue;
        const created = await store.createAccount(item);
        if (created.error) return created;
    }

    const categoryList = await store.getCategories();
    if (categoryList.error) return categoryList;
    for (const item of CATEGORIES) {
        if (categoryList.data.some((row) => row.name === item.name && row.type === item.type)) continue;
        const created = await store.createCategory(item);
        if (created.error) return created;
    }

    const imported = await store.importCsv(buildCsv());
    if (imported.error) return imported;

    // 预算与周期规则要用真实的分类 id，重新取一次（前面可能刚建过自定义分类）。
    const categories = await store.getCategories();
    if (categories.error) return categories;
    const categoryIdOf = (name) => {
        const hit = categories.data.find((row) => row.name === name);
        return hit ? hit.id : '';
    };

    for (const budget of BUDGETS) {
        const saved = await store.setBudget({
            month: shiftMonth(currentMonth(), budget.month),
            categoryId: budget.categoryName ? categoryIdOf(budget.categoryName) : '',
            amountCents: budget.amountCents,
        });
        if (saved.error) return saved;
    }

    const accounts = await store.getAccounts();
    if (accounts.error) return accounts;
    const accountIdOf = (name) => {
        const hit = accounts.data.find((row) => row.name === name);
        return hit ? hit.id : (accounts.data[0] ? accounts.data[0].id : '');
    };

    for (const rule of RECURRING) {
        const saved = await store.setRecurring({
            type: rule.type,
            amountCents: rule.amountCents,
            categoryId: categoryIdOf(rule.categoryName),
            accountId: accountIdOf(rule.accountName),
            day: rule.day,
            note: rule.note,
            enabled: rule.enabled,
        });
        if (saved.error) return saved;
    }

    return ok({
        records: imported.data.imported,
        skipped: imported.data.skipped,
        accounts: accounts.data.length,
        categories: categories.data.length,
        budgets: BUDGETS.length,
        rules: RECURRING.length,
        months: '近 7 个月（其中 1 个月故意留空）',
    });
}

module.exports = { seedSampleData, buildCsv, RECORDS };
