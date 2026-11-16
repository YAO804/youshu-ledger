// 回归测试：小程序 input 的默认高度是 1.4rem（约 22px），
// 只设 font-size 不会把输入框撑高，字号一超过就把文字上下裁掉。
// 这里静态扫描所有 wxss：凡是给 input 设了大于 22px 的字号，必须同时写 height。
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SKIP = ['node_modules', 'miniprogram_npm', '.workbuddy', '.git'];

// 1.4rem @ 16px 根字号；超过这个高度就一定会被裁。
const DEFAULT_INPUT_HEIGHT_PX = 22.4;

function walk(dir, out) {
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        return out;
    }
    entries.forEach((entry) => {
        if (SKIP.indexOf(entry.name) >= 0) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.wxss')) out.push(full);
    });
    return out;
}

function rulesOf(css) {
    // 先去掉注释，否则注释会被当成选择器的一部分，规则被漏掉。
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let match = re.exec(clean);
    while (match) {
        rules.push({ selector: match[1].trim(), body: match[2] });
        match = re.exec(clean);
    }
    return rules;
}

function decl(body, name) {
    const match = body.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)'));
    return match ? match[1].trim() : '';
}

function rpxToPx(value) {
    const match = String(value).match(/^(-?[\d.]+)rpx$/);
    return match ? Number(match[1]) / 2 : null;
}

const files = walk(root, []);
const errors = [];
let inspected = 0;

files.forEach((file) => {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const css = fs.readFileSync(file, 'utf8');
    rulesOf(css).forEach((rule) => {
        // 只看单类选择器且类名带 input 的规则，避免误判 .form-row 之类
        if (!/^\.-?[a-z0-9-]*input[a-z0-9-]*$/i.test(rule.selector)) return;
        const font = decl(rule.body, 'font-size');
        if (!font) return;
        const px = rpxToPx(font);
        if (px === null || px <= DEFAULT_INPUT_HEIGHT_PX) return;

        inspected += 1;
        const height = decl(rule.body, 'height');
        const heightPx = rpxToPx(height);
        if (!height) {
            errors.push(relative + ' ' + rule.selector + '：字号 ' + font
                + ' 但没有 height，文字会被裁切（input 默认高约 22px）');
            return;
        }
        if (heightPx !== null && heightPx < px) {
            errors.push(relative + ' ' + rule.selector + '：height ' + height
                + ' 小于字号 ' + font + '，文字仍会被裁切');
        }
    });
});

if (errors.length > 0) {
    errors.forEach((item) => console.log('FAIL ' + item));
    process.exitCode = 1;
} else {
    console.log('WXSS files: ' + files.length + ' | 大字号 input: ' + inspected + ' | ERRORS: 0');
}
