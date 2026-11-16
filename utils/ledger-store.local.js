const {
    pad, toCents, fromCents, signedAmount, today, currentMonth,
    shiftMonth, monthEnd, normalizeDate,
} = require('./format');
const {
    AVATAR_CUSTOM, DEFAULT_KEY, avatarDisplay, ensureDefaults,
    normalizeAvatar, normalizeAvatarData, resolveAvatar,
} = require('./profile');
const { sortRecords } = require('./record-sort');

const STORAGE_KEY = 'youshu_ledger_v1';

const EXPENSE_NAMES = ['餐饮', '交通', '购物', '居住', '日用', '娱乐', '医疗', '教育', '人情', '其他'];
const INCOME_NAMES = ['工资', '奖金', '理财', '兼职', '其他'];

function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultAccounts() {
    return [
        { id: 'acc_default', name: '默认账户', type: 'cash', initialBalance: 0 },
        { id: 'acc_wechat', name: '微信', type: 'wechat', initialBalance: 0 },
        { id: 'acc_alipay', name: '支付宝', type: 'alipay', initialBalance: 0 },
        { id: 'acc_bank', name: '银行卡', type: 'bank', initialBalance: 0 },
    ];
}

function defaultCategories() {
    const rows = [];
    EXPENSE_NAMES.forEach((name, i) => {
        rows.push({ id: 'cat_e_' + i, name, type: 'expense', sort: i, builtin: true });
    });
    INCOME_NAMES.forEach((name, i) => {
        rows.push({ id: 'cat_i_' + i, name, type: 'income', sort: i, builtin: true });
    });
    return rows;
}

function defaultState() {
    return {
        version: 1,
        profile: { nickname: '', avatar: '', avatarData: '' },
        accounts: defaultAccounts(),
        categories: defaultCategories(),
        records: [],
        budgets: [],
        recurringRules: [],
    };
}

function load() {
    let state = null;
    try {
        state = wx.getStorageSync(STORAGE_KEY);
    } catch (e) {
        state = null;
    }
    if (!state || typeof state !== 'object' || !Array.isArray(state.records)) {
        state = defaultState();
        save(state);
        return state;
    }
    const defaults = defaultState();
    ['accounts', 'categories', 'records', 'budgets', 'recurringRules'].forEach((key) => {
        if (!Array.isArray(state[key])) state[key] = defaults[key];
    });
    if (!state.profile || typeof state.profile !== 'object') state.profile = defaults.profile;
    return state;
}

function save(state) {
    try {
        wx.setStorageSync(STORAGE_KEY, state);
        return true;
    } catch (e) {
        return false;
    }
}

function ok(data) {
    return { data, error: null };
}

function fail(code, message) {
    return { data: null, error: { code, message } };
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

function applyRecurring(state) {
    const todayText = today();
    let generated = 0;
    state.recurringRules.forEach((rule) => {
        if (!rule.enabled || !rule.nextRunAt) return;
        let guard = 0;
        while (rule.nextRunAt <= todayText && guard < 36) {
            guard += 1;
            const key = rule.id + ':' + rule.nextRunAt;
            const exists = state.records.some((r) => r.sourceKey === key);
            if (!exists) {
                state.records.push({
                    id: uid('rec'),
                    type: rule.type,
                    amount: rule.amount,
                    categoryId: rule.categoryId,
                    accountId: rule.accountId,
                    note: rule.note || '周期记账',
                    occurredAt: rule.nextRunAt,
                    createdAt: Date.now(),
                    sourceKey: key,
                });
                generated += 1;
            }
            rule.nextRunAt = nextMonthlyDate(rule.nextRunAt, rule.day);
        }
    });
    return generated;
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
        occurredAt: record.occurredAt,
        amount: record.amount,
        categoryName: category ? category.name : '未分类',
        accountName: account ? account.name : '未指定',
        dateText: record.occurredAt.slice(5),
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

async function init() {
    const state = load();
    const generated = applyRecurring(state);
    // 第一次打开就自动配好昵称和头像，老数据缺头像的也在这里补齐。
    const missingProfile = ensureDefaults(state.profile);
    let dirty = generated > 0;
    if (missingProfile) {
        state.profile = Object.assign({}, state.profile, missingProfile);
        dirty = true;
    }
    if (dirty && !save(state)) {
        return fail('STORAGE_FULL', '本地存储写入失败');
    }
    return ok({ generated });
}

async function getMonthOverview(month) {
    const state = load();
    const rows = recordsOfMonth(state, month);
    const sum = summarize(rows);
    const records = rows
        .slice()
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || (b.createdAt || 0) - (a.createdAt || 0))
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
    const state = load();
    const size = Math.min(Math.max(Number(limit) || 5, 1), 50);
    const rows = sortRecords(state.records, 'time-desc')
        .slice(0, size)
        .map((r) => decorateRecord(state, r));
    return ok(rows);
}

async function getStats(month) {
    const state = load();
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
        const category = state.categories.find((c) => c.id === id);
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

    const trendRows = [];
    for (let i = 5; i >= 0; i -= 1) {
        const m = shiftMonth(month, -i);
        const sum = summarize(recordsOfMonth(state, m));
        trendRows.push({
            id: m,
            label: m.slice(5) + '月',
            incomeText: fromCents(sum.income),
            expenseText: fromCents(sum.expense),
            income: sum.income,
            expense: sum.expense,
            incomeHeight: 4,
            expenseHeight: 4,
        });
    }
    const maxTrend = Math.max(1, ...trendRows.map((t) => Math.max(t.income, t.expense)));
    trendRows.forEach((t) => {
        t.incomeHeight = Math.max(4, Math.round((t.income / maxTrend) * 100));
        t.expenseHeight = Math.max(4, Math.round((t.expense / maxTrend) * 100));
    });

    const budgetRows = state.budgets.filter((b) => b.month === month).map((b) => {
        const used = b.categoryId
            ? expenseRows.filter((r) => r.categoryId === b.categoryId).reduce((sum, r) => sum + r.amount, 0)
            : sum(rows).expense;
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

    return ok({ categoryRows, trendRows, budgetRows });
}

function sum(rows) {
    return summarize(rows);
}

async function getAccounts() {
    const state = load();
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
    const state = load();
    const name = String(payload.name || '').trim();
    if (!name) return fail('INVALID_PAYLOAD', '请填写账户名称');
    if (state.accounts.some((a) => a.name === name)) return fail('ALREADY_EXISTS', '同名账户已存在');
    const account = {
        id: uid('acc'),
        name,
        type: payload.type || 'other',
        initialBalance: Number(payload.initialBalance) || 0,
    };
    state.accounts.push(account);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok(account);
}

async function updateAccount(id, payload) {
    const state = load();
    const account = state.accounts.find((a) => a.id === id);
    if (!account) return fail('NOT_FOUND_OR_FORBIDDEN', '账户不存在');
    const name = String(payload.name || '').trim();
    if (!name) return fail('INVALID_PAYLOAD', '请填写账户名称');
    if (state.accounts.some((a) => a.id !== id && a.name === name)) return fail('ALREADY_EXISTS', '同名账户已存在');
    account.name = name;
    account.type = payload.type || account.type;
    account.initialBalance = Number(payload.initialBalance) || 0;
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok(account);
}

async function removeAccount(id) {
    const state = load();
    const index = state.accounts.findIndex((a) => a.id === id);
    if (index < 0) return fail('NOT_FOUND_OR_FORBIDDEN', '账户不存在');
    if (state.records.some((r) => r.accountId === id)) return fail('IN_USE', '该账户已有账目，不能删除');
    state.accounts.splice(index, 1);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok({ id });
}

async function getCategories(type) {
    const state = load();
    const rows = state.categories
        .filter((c) => !type || c.type === type)
        .slice()
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            builtin: !!c.builtin,
            typeText: c.type === 'income' ? '收入' : '支出',
        }));
    return ok(rows);
}

async function createCategory(payload) {
    const state = load();
    const name = String(payload.name || '').trim();
    const type = payload.type === 'income' ? 'income' : 'expense';
    if (!name) return fail('INVALID_PAYLOAD', '请填写分类名称');
    if (state.categories.some((c) => c.type === type && c.name === name)) return fail('ALREADY_EXISTS', '同名分类已存在');
    const category = {
        id: uid('cat'),
        name,
        type,
        sort: state.categories.filter((c) => c.type === type).length,
        builtin: false,
    };
    state.categories.push(category);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok(category);
}

async function removeCategory(id) {
    const state = load();
    const index = state.categories.findIndex((c) => c.id === id);
    if (index < 0) return fail('NOT_FOUND_OR_FORBIDDEN', '分类不存在');
    if (state.categories[index].builtin) return fail('IN_USE', '预置分类不能删除');
    if (state.records.some((r) => r.categoryId === id)) return fail('IN_USE', '该分类已有账目，不能删除');
    if (state.budgets.some((b) => b.categoryId === id)) return fail('IN_USE', '该分类已设置预算，不能删除');
    state.categories.splice(index, 1);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok({ id });
}

async function getRecord(id) {
    const state = load();
    const record = state.records.find((r) => r.id === id);
    if (!record) return fail('NOT_FOUND_OR_FORBIDDEN', '账目不存在');
    return ok({
        id: record.id,
        type: record.type,
        amount: fromCents(record.amount),
        amountCents: record.amount,
        categoryId: record.categoryId,
        accountId: record.accountId,
        note: record.note || '',
        occurredAt: record.occurredAt,
    });
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

async function createRecord(payload) {
    const state = load();
    const checked = validateRecord(state, payload);
    if (checked.error) return checked;
    const record = {
        id: uid('rec'),
        type: checked.data.type,
        amount: checked.data.amount,
        categoryId: payload.categoryId,
        accountId: payload.accountId,
        note: String(payload.note || '').trim(),
        occurredAt: checked.data.occurredAt,
        createdAt: Date.now(),
    };
    state.records.push(record);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok(record);
}

async function updateRecord(id, payload) {
    const state = load();
    const record = state.records.find((r) => r.id === id);
    if (!record) return fail('NOT_FOUND_OR_FORBIDDEN', '账目不存在');
    const checked = validateRecord(state, payload);
    if (checked.error) return checked;
    record.type = checked.data.type;
    record.amount = checked.data.amount;
    record.categoryId = payload.categoryId;
    record.accountId = payload.accountId;
    record.note = String(payload.note || '').trim();
    record.occurredAt = checked.data.occurredAt;
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok(record);
}

async function removeRecord(id) {
    const state = load();
    const index = state.records.findIndex((r) => r.id === id);
    if (index < 0) return fail('NOT_FOUND_OR_FORBIDDEN', '账目不存在');
    state.records.splice(index, 1);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok({ id });
}

async function getBudgets(month) {
    const state = load();
    const rows = state.budgets.filter((b) => b.month === month).map((b) => {
        const category = state.categories.find((c) => c.id === b.categoryId);
        return {
            id: b.id,
            name: category ? category.name : '总预算',
            amountText: fromCents(b.amount),
            categoryId: b.categoryId || '',
        };
    });
    return ok(rows);
}

async function setBudget(payload) {
    const state = load();
    const amount = Number(payload.amountCents);
    if (!amount || amount <= 0) return fail('INVALID_AMOUNT', '预算金额必须大于 0');
    const month = payload.month || currentMonth();
    const categoryId = payload.categoryId || null;
    const existing = state.budgets.find((b) => b.month === month && (b.categoryId || null) === categoryId);
    if (existing) existing.amount = amount;
    else state.budgets.push({ id: uid('bud'), month, categoryId, amount });
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok({ month, categoryId, amount });
}

async function removeBudget(id) {
    const state = load();
    const index = state.budgets.findIndex((b) => b.id === id);
    if (index < 0) return fail('NOT_FOUND_OR_FORBIDDEN', '预算不存在');
    state.budgets.splice(index, 1);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok({ id });
}

async function getRecurring() {
    const state = load();
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
    const state = load();
    const checked = validateRecord(state, {
        amount: payload.amountCents,
        type: payload.type,
        categoryId: payload.categoryId,
        accountId: payload.accountId,
        occurredAt: today(),
    });
    if (checked.error) return checked;
    const day = Math.min(Math.max(Number(payload.day) || 1, 1), 28);
    const rule = {
        id: payload.id || uid('rr'),
        type: checked.data.type,
        amount: checked.data.amount,
        categoryId: payload.categoryId,
        accountId: payload.accountId,
        note: String(payload.note || '').trim(),
        day,
        nextRunAt: firstRunDate(day),
        enabled: payload.enabled === false ? false : true,
    };
    const index = state.recurringRules.findIndex((r) => r.id === rule.id);
    if (index >= 0) state.recurringRules[index] = rule;
    else state.recurringRules.push(rule);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok(rule);
}

async function toggleRecurring(id) {
    const state = load();
    const rule = state.recurringRules.find((r) => r.id === id);
    if (!rule) return fail('NOT_FOUND_OR_FORBIDDEN', '规则不存在');
    rule.enabled = !rule.enabled;
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok(rule);
}

async function removeRecurring(id) {
    const state = load();
    const index = state.recurringRules.findIndex((r) => r.id === id);
    if (index < 0) return fail('NOT_FOUND_OR_FORBIDDEN', '规则不存在');
    state.recurringRules.splice(index, 1);
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok({ id });
}

async function getProfile() {
    const state = load();
    // 兜底：即使 profile 还没落库，也先渲染一套自动生成的昵称和头像。
    const view = Object.assign({}, state.profile, ensureDefaults(state.profile) || {});
    const nickname = String(view.nickname || '').trim();
    const resolved = resolveAvatar(view);
    const display = avatarDisplay(resolved ? resolved.avatar : '', resolved ? resolved.avatarData : '');
    return ok({
        nickname,
        avatar: resolved ? resolved.avatar : '',
        avatarData: resolved ? resolved.avatarData : '',
        avatarEmoji: display.emoji,
        avatarImage: display.image,
        nicknameText: nickname || '未设置昵称',
        recordCount: state.records.length,
    });
}

async function setProfile(patch) {
    const state = load();
    state.profile.nickname = String(patch.nickname || '').trim().slice(0, 12);
    // 内置头像写入 key 并清掉图片；上传头像同时写入 data URI；不传头像就只改昵称。
    const wanted = normalizeAvatar(patch.avatar);
    const data = normalizeAvatarData(patch.avatarData);
    if (wanted === AVATAR_CUSTOM && data) {
        state.profile.avatar = AVATAR_CUSTOM;
        state.profile.avatarData = data;
    } else if (wanted && wanted !== AVATAR_CUSTOM) {
        state.profile.avatar = wanted;
        state.profile.avatarData = '';
    }
    if (!state.profile.avatar) {
        state.profile.avatar = DEFAULT_KEY;
        state.profile.avatarData = '';
    }
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok(state.profile);
}

async function exportCsv() {
    const state = load();
    const lines = ['日期,收支,金额,分类,账户,备注'];
    state.records
        .slice()
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
        .forEach((r) => {
            const category = state.categories.find((c) => c.id === r.categoryId);
            const account = state.accounts.find((a) => a.id === r.accountId);
            const cells = [
                r.occurredAt,
                r.type === 'income' ? '收入' : '支出',
                fromCents(r.amount),
                category ? category.name : '未分类',
                account ? account.name : '未指定',
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

    const state = load();
    let imported = 0;
    let skipped = 0;
    for (let i = start; i < rows.length; i += 1) {
        const cells = rows[i];
        const date = normalizeDate(cells[header.date]);
        const rawAmount = String(cells[header.amount] === undefined ? '' : cells[header.amount])
            .replace(/[¥,\s]/g, '');
        const amount = toCents(Math.abs(Number(rawAmount)));
        if (!date || !amount) {
            skipped += 1;
            continue;
        }
        const rawType = header.type === undefined ? '' : String(cells[header.type] || '');
        let type = 'expense';
        if (/收入|income|\+|^收$/i.test(rawType)) type = 'income';
        else if (!rawType && Number(rawAmount) > 0 && header.type === undefined) type = 'expense';

        const sourceKey = 'import:' + hashText(date + '|' + amount + '|' + type + '|' + (cells[header.note] || '') + '|' + i);
        if (state.records.some((r) => r.sourceKey === sourceKey)) {
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
        state.records.push({
            id: uid('rec'),
            type,
            amount,
            categoryId: category.id,
            accountId: account.id,
            note: header.note === undefined ? '' : String(cells[header.note] || '').trim(),
            occurredAt: date,
            createdAt: Date.now(),
            sourceKey,
        });
        imported += 1;
    }
    if (imported > 0 && !save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok({ imported, skipped });
}

async function resetAll() {
    // 昵称和头像是身份，不是账目，清空数据时保留。
    const keep = load().profile || {};
    const state = defaultState();
    state.profile = {
        nickname: keep.nickname || '',
        avatar: keep.avatar || '',
        avatarData: keep.avatarData || '',
    };
    if (!save(state)) return fail('STORAGE_FULL', '本地存储写入失败');
    return ok({ reset: true });
}

// 门面在登录成功后用它们把本地试用数据搬到云端。
function snapshot() {
    return JSON.parse(JSON.stringify(load()));
}

function clearLocal() {
    try {
        wx.removeStorageSync(STORAGE_KEY);
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    snapshot,
    clearLocal,
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
