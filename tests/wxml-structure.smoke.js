// WXML 静态回归检查。
// 微信原生编译器会在展开 wx:for 后丢失 wx:else 的配对 wx:if，
// 因此 wx:else / wx:elif 绝不能与 wx:for 写在同一个标签上。
// 这类错误在 H5 预览和纯文本静态检查里不会暴露，只有原生编译才会报：
//   Bad attr `wx:else` with message: `wx:if not found, then something must be wrong`
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [];

function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (['node_modules', 'miniprogram_npm', '.git', '.workbuddy'].includes(entry.name)) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.wxml')) files.push(full);
    });
}
walk(root);

const errors = [];
const tagPattern = /<([a-zA-Z][^>]*)>/g;
const indexExpr = /\{\{[^}]*[A-Za-z_]\w*\[[^\]]+\][^}]*\}\}/;

files.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = tagPattern.exec(source))) {
        const tag = match[1];
        const relative = path.relative(root, file);
        if (/\bwx:(else|elif)\b/.test(tag) && /\bwx:for\b/.test(tag)) {
            errors.push(relative + ': wx:else/wx:elif 与 wx:for 不能同标签 -> ' + tag.trim().slice(0, 100));
        }
        if (indexExpr.test(tag)) {
            errors.push(relative + ': WXML 不支持数组下标表达式 -> ' + tag.trim().slice(0, 100));
        }
    }
});

if (files.length === 0) errors.push('未找到任何 WXML 文件');
console.log('WXML files: ' + files.length + ' | ERRORS: ' + errors.length);
errors.forEach((line) => console.log(' - ' + line));
if (errors.length) process.exit(1);
