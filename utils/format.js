function pad(n) {
    return String(n).padStart(2, '0');
}

function toCents(value) {
    const n = Number(value);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
}

function fromCents(cents) {
    const n = Number(cents) || 0;
    return (n / 100).toFixed(2);
}

function signedAmount(type, cents) {
    return (type === 'income' ? '+' : '-') + fromCents(cents);
}

function today() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function currentMonth() {
    return today().slice(0, 7);
}

function shiftMonth(month, delta) {
    const parts = month.split('-');
    let y = Number(parts[0]);
    let m = Number(parts[1]) + delta;
    while (m < 1) {
        m += 12;
        y -= 1;
    }
    while (m > 12) {
        m -= 12;
        y += 1;
    }
    return y + '-' + pad(m);
}

function monthEnd(month) {
    const parts = month.split('-');
    const last = new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
    return month + '-' + pad(last);
}

function normalizeDate(value) {
    if (!value) return '';
    const text = String(value).trim().replace(/\//g, '-');
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return '';
    return match[1] + '-' + pad(Number(match[2])) + '-' + pad(Number(match[3]));
}

module.exports = {
    pad,
    toCents,
    fromCents,
    signedAmount,
    today,
    currentMonth,
    shiftMonth,
    monthEnd,
    normalizeDate,
};
