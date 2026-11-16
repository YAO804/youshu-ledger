const { cloud } = require('./cloud');
const { createTableAccess } = require('./workbuddy-data-access');
const {
    pad, toCents, fromCents, signedAmount, today, currentMonth,
    monthEnd, normalizeDate,
} = require('./format');
const {
    AVATAR_CUSTOM, DEFAULT_KEY, avatarDisplay, createDefaultProfile, ensureDefaults,
    normalizeAvatar, normalizeAvatarData, resolveAvatar,
} = require('./profile');
const { sortRecords } = require('./record-sort');
const { trendMonths, buildTrendRows } = require('./trend');

const EXPENSE_NAMES = ['餐饮', '交通', '购物', '居住', '日用', '娱乐', '医疗', '教育', '人情', '其他'];
const INCOME_NAMES = ['工资', '奖金', '理财', '兼职', '其他'];

const TABLES = [
    'ledger_records', 'ledger_budgets', 'ledger_recurring_rules',
    'ledger_categories', 'ledger_accounts', 'ledger_profiles',
];

function ok(data) {
    return { data, error: null };
}

function fail(code, message) {
    return { data: null, error: { code, message } };
}

function pick(payload, mapping) {
    const row = {};
    Object.keys(mapping).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            row[mapping[key]] = payload[key];
        }
    });
    return row;
}

function makeAccess(table, columns, fromRow, mapping) {
    return createTableAccess(cloud, {
        table,
        columns,
        fromRow,
        toRow: (payload) => pick(payload || {}, mapping),
        orderBy: { column: 'id', ascending: true },
    });
}

const accountAccess = makeAccess(
    'ledger_accounts',
    ['id', 'name', 'type', 'initial_balance'],
    (r) => ({ id: r.id, name: r.name, type: r.type, initialBalance: Number(r.initial_balance) || 0 }),
    { name: 'name', type: 'type', initialBalance: 'initial_balance' },
);

const categoryAccess = makeAccess(
    'ledger_categories',
    ['id', 'name', 'type', 'sort', 'builtin'],
    (r) => ({ id: r.id, name: r.name, type: r.type, sort: Number(r.sort) || 0, builtin: !!r.builtin }),
    { name: 'name', type: 'type', sort: 'sort', builtin: 'builtin' },
);

const recordAccess = makeAccess(
    'ledger_records',
    ['id', 'type', 'amount', 'category_id', 'account_id', 'note', 'occurred_at', 'source_key', 'created_at'],
    (r) => ({
        id: r.id,
        type: r.type,
        amount: Number(r.amount) || 0,
        categoryId: r.category_id,
        accountId: r.account_id,
        note: r.note || '',
        occurredAt: r.occurred_at,
        sourceKey: r.source_key || '',
        createdAt: Date.parse(r.created_at) || 0,
    }),
    {
        type: 'type', amount: 'amount', categoryId: 'category_id', accountId: 'account_id',
        note: 'note', occurredAt: 'occurred_at', sourceKey: 'source_key',
    },
);

const budgetAccess = makeAccess(
    'ledger_budgets',
    ['id', 'month', 'category_id', 'amount'],
    (r) => ({ id: r.id, month: r.month, categoryId: r.category_id, amount: Number(r.amount) || 0 }),
    { month: 'month', categoryId: 'category_id', amount: 'amount' },
);

const ruleAccess = makeAccess(
    'ledger_recurring_rules',
    ['id', 'type', 'amount', 'category_id', 'account_id', 'note', 'day', 'next_run_at', 'enabled'],
    (r) => ({
        id: r.id,
        type: r.type,
        amount: Number(r.amount) || 0,
        categoryId: r.category_id,
        accountId: r.account_id,
        note: r.note || '',
        day: Number(r.day) || 1,
        nextRunAt: r.next_run_at,
        enabled: !!r.enabled,
    }),
    {
        type: 'type', amount: 'amount', categoryId: 'category_id', accountId: 'account_id',
        note: 'note', day: 'day', nextRunAt: 'next_run_at', enabled: 'enabled',
    },
);

const profileAccess = makeAccess(
    'ledger_profiles',
    ['id', 'nickname', 'avatar', 'avatar_data'],
    (r) => ({
        id: r.id,
        nickname: r.nickname || '',
        avatar: r.avatar || '',
        avatarData: r.avatar_data || '',
    }),
    { nickname: 'nickname', avatar: 'avatar', avatarData: 'avatar_data' },
);

function defaultAccounts() {
    return [
        { name: '默认账户', type: 'cash', initialBalance: 0 },
        { name: '微信', type: 'wechat', initialBalance: 0 },
        { name: '支付宝', type: 'alipay', initialBalance: 0 },
        { name: '银行卡', type: 'bank', initialBalance: 0 },
    ];
}

function defaultCategories() {
    const rows = [];
    EXPENSE_NAMES.forEach((name, i) => rows.push({ name, type: 'expense', sort: i, builtin: true }));
    INCOME_NAMES.forEach((name, i) => rows.push({ name, type: 'income', sort: i, builtin: true }));
    return rows;
}

// 共享账本：不需要账号。匿名请求的 auth.uid() 恒为同一个值，
// 因此两个人打开小程序读写的就是同一份数据（RLS 仍由 owner_id 兜底）。
async function loadState() {
    const results = await Promise.all([
        accountAccess.list(), categoryAccess.list(), recordAccess.list(),
        budgetAccess.list(), ruleAccess.list(), profileAccess.list(),
    ]);
    const broken = results.find((r) => r && r.error);
    if (broken) {
        return fail(broken.error.code || 'CLIENT_EXCEPTION', broken.error.message || '云端数据加载失败');
    }
    return ok({
        accounts: results[0].data,
        categories: results[1].data,
        records: results[2].data,
        budgets: results[3].data,
        recurringRules: results[4].data,
        profiles: results[5].data,
    });
}

function nextMonthlyDate(dateText, day) {
    const parts = dateText.split('-');
    let y = Number(parts[0]);
    let m = Number(parts[1]) + 1;
    if (m > 12) {
        m = 1;
        y += 1;
    }
    const last = new Date(y, m, 0).getDate();
    const d = Math.min(Math.max(Number(day) || 1, 1), last);
    return y + '-' + pad(m) + '-' + pad(d);
}

function firstRunDate(day) {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    const dd = Math.min(Math.max(Number(day) || 1, 1), last);
    const candidate = y + '-' + pad(m) + '-' + pad(dd);
    return candidate < today() ? nextMonthlyDate(candidate, day) : candidate;
}

function recordsOfMonth(state, month) {
    const start = month + '-01';
    const end = monthEnd(month);
    return state.records.filter((r) => r.occurredAt >= start && r.occurredAt <= end);
}

function summarize(rows) {
    let income = 0;
    let expense = 0;
    rows.forEach((r) => {
        if (r.type === 'income') income += r.amount;
        else expense += r.amount;
    });
    return { income, expense, balance: income - expense };
}

function decorateRecord(state, record) {
    const category = state.categories.find((c) => c.id === record.categoryId);
    const account = state.accounts.find((a) => a.id === record.accountId);
    return {
        id: record.id,
        type: record.type,
        // categoryId / occurredAt / amount 是给分类详情页排序筛选用，页面展示仍用格式化字段。
        categoryId: record.categoryId,
        occurredAt: String(record.occurredAt),
        amount: record.amount,
        categoryName: category ? category.name : '未分类',
        accountName: account ? account.name : '未指定',
        dateText: String(record.occurredAt).slice(5),
        noteText: record.note || '',
        amountText: signedAmount(record.type, record.amount),
    };
}

function hashText(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) {
        h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                cell += ch;
            }
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ',') {
            row.push(cell.trim());
            cell = '';
        } else if (ch === '\n') {
            row.push(cell.trim());
            if (row.some((c) => c !== '')) rows.push(row);
            row = [];
            cell = '';
        } else if (ch !== '\r') {
            cell += ch;
        }
    }
    row.push(cell.trim());
    if (row.some((c) => c !== '')) rows.push(row);
    return rows;
}

function mapHeader(row) {
    const map = {};
    row.forEach((cell, index) => {
        const text = String(cell).replace(/\s/g, '');
        if (/日期|时间|date/i.test(text)) map.date = index;
        else if (/金额|amount/i.test(text)) map.amount = index;
        else if (/分类|类别|category/i.test(text)) map.category = index;
        else if (/备注|说明|商品|摘要|note|remark/i.test(text)) map.note = index;
        else if (/收支|方向|类型|type/i.test(text)) map.type = index;
        else if (/账户|account/i.test(text)) map.account = index;
    });
    return map;
}

function validateRecord(state, payload) {
    const amount = Number(payload.amountCents !== undefined ? payload.amountCents : payload.amount);
    const type = payload.type === 'income' ? 'income' : 'expense';
    if (!amount || amount <= 0) return fail('INVALID_AMOUNT', '金额必须大于 0');
    if (!state.categories.some((c) => c.id === payload.categoryId && c.type === type)) {
        return fail('INVALID_CATEGORY', '请选择与收支类型匹配的分类');
    }
    if (!state.accounts.some((a) => a.id === payload.accountId)) {
        return fail('INVALID_ACCOUNT', '请选择支付账户');
    }
    const occurredAt = normalizeDate(payload.occurredAt);
    if (!occurredAt) return fail('INVALID_DATE', '日期格式不正确');
    return ok({ amount, type, occurredAt });
}

function writeResult(result, mapData) {
    if (result.error) {
        const code = result.error.code || '';
        if (code === '23505') return fail('ALREADY_EXISTS', '这条记录已存在，请勿重复提交');
        if (code === '42501') return fail('FORBIDDEN', '没有权限，请重新登录后再试');
        return fail(code || 'WRITE_FAILED', result.error.message || '保存失败');
    }
    return ok(mapData ? mapData(result.data) : result.data);
}

async function init() {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    let generated = 0;

    if (state.accounts.length === 0) {
        for (const item of defaultAccounts()) {
            const res = await accountAccess.create(item);
            if (res.error) return fail('SEED_FAILED', '初始化账户失败：' + res.error.message);
            state.accounts.push(res.data);
        }
    }
    if (state.categories.length === 0) {
        for (const item of defaultCategories()) {
            const res = await categoryAccess.create(item);
            if (res.error) return fail('SEED_FAILED', '初始化分类失败：' + res.error.message);
            state.categories.push(res.data);
        }
    }
    // 昵称和头像都自动配好再落库，用户第一次打开就有「爱攒钱的小猫」可用；
    // 老数据里缺头像的也在这里补齐（同一昵称映射到同一头像，两台手机看到的一样）。
    const missingProfile = ensureDefaults(state.profiles[0] || null);
    if (state.profiles.length === 0) {
        const res = await profileAccess.create(missingProfile || createDefaultProfile());
        if (res.error) return fail('SEED_FAILED', '初始化资料失败：' + res.error.message);
        state.profiles.push(res.data);
    } else if (missingProfile) {
        const res = await profileAccess.update(state.profiles[0].id, missingProfile);
        if (res.error) return fail('SEED_FAILED', '初始化资料失败：' + res.error.message);
        state.profiles[0] = res.data;
    }

    const todayText = today();
    for (const rule of state.recurringRules) {
        if (!rule.enabled || !rule.nextRunAt) continue;
        let guard = 0;
        while (rule.nextRunAt <= todayText && guard < 36) {
            guard += 1;
            const key = String(rule.id) + ':' + rule.nextRunAt;
            if (!state.records.some((r) => r.sourceKey === key)) {
                const res = await recordAccess.create({
                    type: rule.type,
                    amount: rule.amount,
                    categoryId: rule.categoryId,
                    accountId: rule.accountId,
                    note: rule.note || '周期记账',
                    occurredAt: rule.nextRunAt,
                    sourceKey: key,
                });
                if (!res.error && res.data) {
                    state.records.push(res.data);
                    generated += 1;
                }
            }
            rule.nextRunAt = nextMonthlyDate(rule.nextRunAt, rule.day);
        }
        const updated = await ruleAccess.update(rule.id, { nextRunAt: rule.nextRunAt });
        if (updated.error) return fail('RULE_UPDATE_FAILED', updated.error.message);
    }
    return ok({ generated });
}

async function getMonthOverview(month) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const rows = recordsOfMonth(state, month);
    const sum = summarize(rows);
    const records = rows
        .slice()
        .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)) || (b.createdAt || 0) - (a.createdAt || 0))
        .map((r) => decorateRecord(state, r));

    let budgetHint = '';
    const totalBudget = state.budgets.find((b) => b.month === month && !b.categoryId);
    if (totalBudget) {
        const percent = totalBudget.amount ? Math.round((sum.expense / totalBudget.amount) * 100) : 0;
        budgetHint = sum.expense > totalBudget.amount
            ? '本月支出已超预算 ' + fromCents(sum.expense - totalBudget.amount) + ' 元'
            : '本月预算已用 ' + percent + '%';
    }
    return ok({
        month,
        incomeText: fromCents(sum.income),
        expenseText: fromCents(sum.expense),
        balanceText: fromCents(sum.balance),
        income: sum.income,
        expense: sum.expense,
        balance: sum.balance,
        recordCount: rows.length,
        records,
        budgetHint,
    });
}

// 最近 N 笔，跨月份按时间倒序。记一笔页用它做「刚记的那笔」即时确认，
// 语义和概览的「本月账目」不同：不跟月份走，补记上月也能立刻看到。
async function getRecentRecords(limit) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const size = Math.min(Math.max(Number(limit) || 5, 1), 50);
    const rows = sortRecords(state.records, 'time-desc')
        .slice(0, size)
        .map((r) => decorateRecord(state, r));
    return ok(rows);
}

async function getStats(month) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const rows = recordsOfMonth(state, month);
    const expenseRows = rows.filter((r) => r.type === 'expense');
    const expenseTotal = expenseRows.reduce((sum, r) => sum + r.amount, 0);

    const byCategory = {};
    const countByCategory = {};
    expenseRows.forEach((r) => {
        byCategory[r.categoryId] = (byCategory[r.categoryId] || 0) + r.amount;
        countByCategory[r.categoryId] = (countByCategory[r.categoryId] || 0) + 1;
    });
    const categoryRows = Object.keys(byCategory).map((id, index) => {
        const category = state.categories.find((c) => String(c.id) === id);
        const amount = byCategory[id];
        const percent = expenseTotal ? Math.round((amount / expenseTotal) * 100) : 0;
        return {
            id: id || 'none_' + index,
            name: category ? category.name : '未分类',
            amountText: fromCents(amount),
            percentText: percent + '%',
            percent,
            amount,
            count: countByCategory[id] || 0,
        };
    }).sort((a, b) => b.amount - a.amount);

    const trendSummary = (m) => summarize(recordsOfMonth(state, m));
    // 统计页的窗口以「今天」为右界，翻历史月份时整年不漂移。
    const trendRows = buildTrendRows(trendMonths(month), trendSummary);
    // 概览页只画 6 根柱子，且必须以选中月为右界 —— 否则翻到今年早些时候，
    // 选中月会落在 12 个月窗口的前半段，被「取尾 6 个」切掉，图上根本没有那根柱子。
    const overviewTrendRows = buildTrendRows(trendMonths(month, { size: 6, today: month }), trendSummary);

    const budgetRows = state.budgets.filter((b) => b.month === month).map((b) => {
        const used = b.categoryId
            ? expenseRows.filter((r) => r.categoryId === b.categoryId).reduce((s, r) => s + r.amount, 0)
            : summarize(rows).expense;
        const percent = b.amount ? Math.min(100, Math.round((used / b.amount) * 100)) : 0;
        const category = state.categories.find((c) => c.id === b.categoryId);
        return {
            id: b.id,
            name: category ? category.name : '总预算',
            usedText: fromCents(used),
            limitText: fromCents(b.amount),
            percent,
            over: used > b.amount,
            amount: b.amount,
            categoryId: b.categoryId || '',
        };
    });
    return ok({ categoryRows, trendRows, overviewTrendRows, budgetRows });
}

async function getAccounts() {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const rows = state.accounts.map((account) => {
        let delta = 0;
        state.records.forEach((r) => {
            if (r.accountId === account.id) delta += r.type === 'income' ? r.amount : -r.amount;
        });
        return {
            id: account.id,
            name: account.name,
            type: account.type,
            initialBalanceText: fromCents(account.initialBalance),
            balanceText: fromCents(account.initialBalance + delta),
        };
    });
    return ok(rows);
}

async function createAccount(payload) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const name = String(payload.name || '').trim();
    if (!name) return fail('INVALID_PAYLOAD', '请填写账户名称');
    if (loaded.data.accounts.some((a) => a.name === name)) return fail('ALREADY_EXISTS', '同名账户已存在');
    return writeResult(await accountAccess.create({
        name, type: payload.type || 'other', initialBalance: Number(payload.initialBalance) || 0,
    }));
}

async function updateAccount(id, payload) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const name = String(payload.name || '').trim();
    if (!name) return fail('INVALID_PAYLOAD', '请填写账户名称');
    if (loaded.data.accounts.some((a) => a.id !== id && a.name === name)) return fail('ALREADY_EXISTS', '同名账户已存在');
    return writeResult(await accountAccess.update(id, {
        name, type: payload.type || 'other', initialBalance: Number(payload.initialBalance) || 0,
    }));
}

async function removeAccount(id) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    if (!loaded.data.accounts.some((a) => a.id === id)) return fail('NOT_FOUND_OR_FORBIDDEN', '账户不存在');
    if (loaded.data.records.some((r) => r.accountId === id)) return fail('IN_USE', '该账户已有账目，不能删除');
    return writeResult(await accountAccess.remove(id));
}

async function getCategories(type) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const rows = loaded.data.categories
        .filter((c) => !type || c.type === type)
        .slice()
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map((c) => ({
            id: c.id, name: c.name, type: c.type, builtin: !!c.builtin,
            typeText: c.type === 'income' ? '收入' : '支出',
        }));
    return ok(rows);
}

async function createCategory(payload) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const name = String(payload.name || '').trim();
    const type = payload.type === 'income' ? 'income' : 'expense';
    if (!name) return fail('INVALID_PAYLOAD', '请填写分类名称');
    const state = loaded.data;
    if (state.categories.some((c) => c.type === type && c.name === name)) return fail('ALREADY_EXISTS', '同名分类已存在');
    return writeResult(await categoryAccess.create({
        name, type,
        sort: state.categories.filter((c) => c.type === type).length,
        builtin: false,
    }));
}

async function removeCategory(id) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const category = state.categories.find((c) => c.id === id);
    if (!category) return fail('NOT_FOUND_OR_FORBIDDEN', '分类不存在');
    if (category.builtin) return fail('IN_USE', '预置分类不能删除');
    if (state.records.some((r) => r.categoryId === id)) return fail('IN_USE', '该分类已有账目，不能删除');
    if (state.budgets.some((b) => b.categoryId === id)) return fail('IN_USE', '该分类已设置预算，不能删除');
    return writeResult(await categoryAccess.remove(id));
}

async function getRecord(id) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const record = loaded.data.records.find((r) => r.id === id);
    if (!record) return fail('NOT_FOUND_OR_FORBIDDEN', '账目不存在');
    return ok({
        id: record.id, type: record.type,
        amount: fromCents(record.amount), amountCents: record.amount,
        categoryId: record.categoryId, accountId: record.accountId,
        note: record.note || '', occurredAt: record.occurredAt,
    });
}

async function createRecord(payload) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const checked = validateRecord(loaded.data, payload);
    if (checked.error) return checked;
    return writeResult(await recordAccess.create({
        type: checked.data.type,
        amount: checked.data.amount,
        categoryId: payload.categoryId,
        accountId: payload.accountId,
        note: String(payload.note || '').trim(),
        occurredAt: checked.data.occurredAt,
    }));
}

async function updateRecord(id, payload) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const checked = validateRecord(loaded.data, payload);
    if (checked.error) return checked;
    return writeResult(await recordAccess.update(id, {
        type: checked.data.type,
        amount: checked.data.amount,
        categoryId: payload.categoryId,
        accountId: payload.accountId,
        note: String(payload.note || '').trim(),
        occurredAt: checked.data.occurredAt,
    }));
}

async function removeRecord(id) {
    return writeResult(await recordAccess.remove(id));
}

async function getBudgets(month) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const rows = state.budgets.filter((b) => b.month === month).map((b) => {
        const category = state.categories.find((c) => c.id === b.categoryId);
        return {
            id: b.id, name: category ? category.name : '总预算',
            amountText: fromCents(b.amount), categoryId: b.categoryId || '',
        };
    });
    return ok(rows);
}

async function setBudget(payload) {
    const amount = Number(payload.amountCents);
    if (!amount || amount <= 0) return fail('INVALID_AMOUNT', '预算金额必须大于 0');
    const month = payload.month || currentMonth();
    const categoryId = payload.categoryId || null;
    const existing = await budgetAccess.list();
    if (existing.error) return writeResult(existing);
    const found = existing.data.find((b) => b.month === month && (b.categoryId || null) === categoryId);
    if (found) return writeResult(await budgetAccess.update(found.id, { amount }));
    return writeResult(await budgetAccess.create({ month, categoryId, amount }));
}

async function removeBudget(id) {
    return writeResult(await budgetAccess.remove(id));
}

async function getRecurring() {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const rows = state.recurringRules.map((rule) => {
        const category = state.categories.find((c) => c.id === rule.categoryId);
        const account = state.accounts.find((a) => a.id === rule.accountId);
        return {
            id: rule.id,
            title: (category ? category.name : '未分类') + ' · 每月 ' + rule.day + ' 日',
            amountText: signedAmount(rule.type, rule.amount),
            accountName: account ? account.name : '未指定',
            statusText: rule.enabled ? '已启用' : '已停用',
            nextRunAt: rule.nextRunAt,
            type: rule.type,
            amountYuan: fromCents(rule.amount),
            categoryId: rule.categoryId,
            accountId: rule.accountId,
            day: rule.day,
            note: rule.note || '',
            enabled: rule.enabled,
        };
    });
    return ok(rows);
}

async function setRecurring(payload) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const checked = validateRecord(loaded.data, {
        amountCents: payload.amountCents,
        type: payload.type,
        categoryId: payload.categoryId,
        accountId: payload.accountId,
        occurredAt: today(),
    });
    if (checked.error) return checked;
    const day = Math.min(Math.max(Number(payload.day) || 1, 1), 28);
    const values = {
        type: checked.data.type,
        amount: checked.data.amount,
        categoryId: payload.categoryId,
        accountId: payload.accountId,
        note: String(payload.note || '').trim(),
        day,
        nextRunAt: firstRunDate(day),
        enabled: payload.enabled === false ? false : true,
    };
    if (payload.id) return writeResult(await ruleAccess.update(payload.id, values));
    return writeResult(await ruleAccess.create(values));
}

async function toggleRecurring(id) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const rule = loaded.data.recurringRules.find((r) => r.id === id);
    if (!rule) return fail('NOT_FOUND_OR_FORBIDDEN', '规则不存在');
    return writeResult(await ruleAccess.update(id, { enabled: !rule.enabled }));
}

async function removeRecurring(id) {
    return writeResult(await ruleAccess.remove(id));
}

async function getProfile() {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const row = state.profiles.length ? state.profiles[0] : {};
    const nickname = row.nickname || '';
    const resolved = resolveAvatar(row);
    const view = avatarDisplay(resolved ? resolved.avatar : '', resolved ? resolved.avatarData : '');
    return ok({
        nickname,
        avatar: resolved ? resolved.avatar : '',
        avatarData: resolved ? resolved.avatarData : '',
        avatarEmoji: view.emoji,
        avatarImage: view.image,
        nicknameText: nickname || '未设置昵称',
        recordCount: state.records.length,
    });
}

async function setProfile(patch) {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const nickname = String(patch.nickname || '').trim().slice(0, 12);
    const row = { nickname };
    // 内置头像写入 key 并清掉图片；上传头像同时写入 data URI；不传头像就只改昵称。
    const wanted = normalizeAvatar(patch.avatar);
    const data = normalizeAvatarData(patch.avatarData);
    if (wanted === AVATAR_CUSTOM && data) {
        row.avatar = AVATAR_CUSTOM;
        row.avatarData = data;
    } else if (wanted && wanted !== AVATAR_CUSTOM) {
        row.avatar = wanted;
        row.avatarData = '';
    }
    if (loaded.data.profiles.length) {
        return writeResult(await profileAccess.update(loaded.data.profiles[0].id, row));
    }
    return writeResult(await profileAccess.create(Object.assign({ avatar: DEFAULT_KEY, avatarData: '' }, row)));
}

async function exportCsv() {
    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const lines = ['日期,收支,金额,分类,账户,备注'];
    state.records.slice().sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
        .forEach((r) => {
            const category = state.categories.find((c) => c.id === r.categoryId);
            const account = state.accounts.find((a) => a.id === r.accountId);
            const cells = [
                r.occurredAt, r.type === 'income' ? '收入' : '支出', fromCents(r.amount),
                category ? category.name : '未分类', account ? account.name : '未指定',
                (r.note || '').replace(/"/g, '""'),
            ];
            lines.push(cells.map((c) => '"' + c + '"').join(','));
        });
    return ok({ csv: '\uFEFF' + lines.join('\r\n'), count: state.records.length });
}

async function importCsv(text) {
    if (!text || typeof text !== 'string') return fail('INVALID_PAYLOAD', '没有可导入的内容');
    let content = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    content = content.replace(/^\s+/, '');
    const rows = parseCsv(content);
    if (rows.length < 2) return fail('INVALID_PAYLOAD', 'CSV 至少需要表头和一行数据');

    let header = null;
    let start = 1;
    for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
        const mapped = mapHeader(rows[i]);
        if (mapped.date !== undefined && mapped.amount !== undefined) {
            header = mapped;
            start = i + 1;
            break;
        }
    }
    if (!header) header = { date: 0, type: 1, amount: 2, category: 3, account: 4, note: 5 };

    const loaded = await loadState();
    if (loaded.error) return loaded;
    const state = loaded.data;
    const pending = [];
    let skipped = 0;
    for (let i = start; i < rows.length; i += 1) {
        const cells = rows[i];
        const date = normalizeDate(cells[header.date]);
        const rawAmount = String(cells[header.amount] === undefined ? '' : cells[header.amount]).replace(/[¥,\s]/g, '');
        const amount = toCents(Math.abs(Number(rawAmount)));
        if (!date || !amount) {
            skipped += 1;
            continue;
        }
        const rawType = header.type === undefined ? '' : String(cells[header.type] || '');
        const type = /收入|income|\+|^收$/i.test(rawType) ? 'income' : 'expense';
        const sourceKey = 'import:' + hashText(date + '|' + amount + '|' + type + '|' + (cells[header.note] || '') + '|' + i);
        if (state.records.some((r) => r.sourceKey === sourceKey) || pending.some((r) => r.sourceKey === sourceKey)) {
            skipped += 1;
            continue;
        }
        const categoryName = header.category === undefined ? '' : String(cells[header.category] || '').trim();
        const category = state.categories.find((c) => c.type === type && c.name === categoryName)
            || state.categories.find((c) => c.type === type && c.name === '其他')
            || state.categories.find((c) => c.type === type);
        const accountName = header.account === undefined ? '' : String(cells[header.account] || '').trim();
        const account = state.accounts.find((a) => a.name === accountName) || state.accounts[0];
        if (!category || !account) {
            skipped += 1;
            continue;
        }
        pending.push({
            type,
            amount,
            category_id: category.id,
            account_id: account.id,
            note: header.note === undefined ? '' : String(cells[header.note] || '').trim(),
            occurred_at: date,
            source_key: sourceKey,
        });
    }
    if (pending.length === 0) return ok({ imported: 0, skipped });
    const { error } = await cloud.database.from('ledger_records').insert(pending).select('id');
    if (error) {
        if (error.code === '23505') return fail('ALREADY_EXISTS', '部分账目已存在，未重复导入');
        return writeResult({ data: null, error });
    }
    return ok({ imported: pending.length, skipped });
}

async function resetAll() {
    // 昵称和头像是身份，不是账目，清空数据时保留 ledger_profiles。
    for (const table of TABLES) {
        if (table === 'ledger_profiles') continue;
        const { error } = await cloud.database.from(table).delete().gte('id', 0).select('id');
        if (error) return fail(error.code || 'RESET_FAILED', error.message || '清空失败');
    }
    return ok({ reset: true });
}

module.exports = {
    init,
    getMonthOverview,
    getRecentRecords,
    getStats,
    getAccounts,
    createAccount,
    updateAccount,
    removeAccount,
    getCategories,
    createCategory,
    removeCategory,
    getRecord,
    createRecord,
    updateRecord,
    removeRecord,
    getBudgets,
    setBudget,
    removeBudget,
    getRecurring,
    setRecurring,
    toggleRecurring,
    removeRecurring,
    getProfile,
    setProfile,
    exportCsv,
    importCsv,
    resetAll,
};
