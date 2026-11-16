// 昵称与头像：新账本第一次打开就自动配好一套，用户不用手输。
// 头像用系统 emoji 渲染（Twemoji / Noto Emoji 那一类圆润可爱的表情），
// 不打包图片、不依赖网络域名，任何分辨率都不糊。

const AVATARS = [
    { key: 'cat', emoji: '🐱', label: '小猫' },
    { key: 'fox', emoji: '🦊', label: '小狐狸' },
    { key: 'panda', emoji: '🐼', label: '熊猫' },
    { key: 'penguin', emoji: '🐧', label: '小企鹅' },
    { key: 'rabbit', emoji: '🐰', label: '小兔子' },
    { key: 'dog', emoji: '🐶', label: '小狗' },
    { key: 'strawberry', emoji: '🍓', label: '草莓' },
    { key: 'peach', emoji: '🍑', label: '桃子' },
];

// 前缀用「记账人的自嘲」，配上头像就是一句完整的俏皮昵称，如「爱攒钱的小猫」。
const PREFIXES = ['爱攒钱', '会过日子', '不喝奶茶', '精打细算', '月光绝缘', '抠门又快乐'];

const DEFAULT_KEY = AVATARS[0].key;

function isKnown(key) {
    return AVATARS.some((item) => item.key === key);
}

function normalizeAvatar(key) {
    const text = String(key || '').trim();
    return isKnown(text) ? text : '';
}

function avatarEmoji(key) {
    const found = AVATARS.find((item) => item.key === normalizeAvatar(key));
    return found ? found.emoji : AVATARS[0].emoji;
}

function avatarOptions() {
    return AVATARS.map((item) => ({ key: item.key, emoji: item.emoji, label: item.label }));
}

function nextAvatar(key, step) {
    const current = AVATARS.findIndex((item) => item.key === normalizeAvatar(key));
    const delta = typeof step === 'number' && step !== 0 ? step : 1;
    const base = current < 0 ? 0 : current;
    return AVATARS[(base + delta + AVATARS.length) % AVATARS.length].key;
}

// 同一个昵称永远映射到同一个头像，避免同一份账本在两台手机上头像跳来跳去。
function stableSeed(text) {
    const source = String(text || '');
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
        hash = (hash * 31 + source.charCodeAt(i)) % 2147483647;
    }
    return hash;
}

function randomSeed() {
    return (Date.now() + Math.floor(Math.random() * 997)) % 2147483647;
}

// 昵称主体跟着头像走 —— 头像选小猫，昵称就是「爱攒钱的小猫」。
function createDefaultProfile(seed) {
    const value = typeof seed === 'number' && isFinite(seed) && seed > 0 ? Math.floor(seed) : randomSeed();
    const avatar = AVATARS[value % AVATARS.length];
    const prefix = PREFIXES[Math.floor(value / AVATARS.length) % PREFIXES.length];
    return { nickname: prefix + '的' + avatar.label, avatar: avatar.key };
}

// 返回需要补齐的字段；都齐了就返回 null，不产生任何写入。
function ensureDefaults(profile) {
    const row = profile || {};
    const nickname = String(row.nickname || '').trim();
    const avatar = normalizeAvatar(row.avatar);
    if (nickname && avatar) return null;
    const generated = createDefaultProfile(nickname ? stableSeed(nickname) : undefined);
    return {
        nickname: nickname || generated.nickname,
        avatar: avatar || generated.avatar,
    };
}

module.exports = {
    AVATARS,
    DEFAULT_KEY,
    avatarEmoji,
    avatarOptions,
    createDefaultProfile,
    ensureDefaults,
    nextAvatar,
    normalizeAvatar,
    stableSeed,
};
