// 昵称与头像：新账本第一次打开就自动配好一套，用户不用手输。
// 内置头像用系统 emoji 渲染（Twemoji / Noto Emoji 那一类圆润可爱的表情），
// 不打包图片、不依赖网络域名，任何分辨率都不糊；也支持用户自己上传一张照片。

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
// 自定义上传的头像：avatar 存 'custom'，真实图片是 avatarData 里的 data URI。
// 存成 data URI 而不是网络地址，是为了绕开真机 request/downloadFile 域名白名单。
const AVATAR_CUSTOM = 'custom';
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
// 云端一行塞太大的文本没意义，140K 字符（约 100KB 图片）已经够 240x240 用。
const MAX_AVATAR_DATA_CHARS = 140 * 1024;

function isKnown(key) {
    return AVATARS.some((item) => item.key === key);
}

function normalizeAvatar(key) {
    const text = String(key || '').trim();
    if (text === AVATAR_CUSTOM) return AVATAR_CUSTOM;
    return isKnown(text) ? text : '';
}

function normalizeAvatarData(value) {
    const text = typeof value === 'string' ? value : '';
    if (!text || text.length > MAX_AVATAR_DATA_CHARS) return '';
    return DATA_IMAGE_RE.test(text) ? text : '';
}

// 校验「头像 + 图片」这组字段：custom 必须有图，内置 key 不该带图。
function resolveAvatar(profile) {
    const row = profile || {};
    const key = normalizeAvatar(row.avatar);
    if (key === AVATAR_CUSTOM) {
        const data = normalizeAvatarData(row.avatarData);
        return data ? { avatar: AVATAR_CUSTOM, avatarData: data } : null;
    }
    if (key) return { avatar: key, avatarData: '' };
    return null;
}

// 页面渲染用：有图就显示图，没图按 key 取 emoji。
function avatarDisplay(avatar, avatarData) {
    const resolved = resolveAvatar({ avatar, avatarData });
    if (resolved && resolved.avatar === AVATAR_CUSTOM) {
        return { emoji: '', image: resolved.avatarData };
    }
    return { emoji: avatarEmoji(resolved ? resolved.avatar : ''), image: '' };
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
    const resolved = resolveAvatar(row);
    if (nickname && resolved) return null;
    const generated = createDefaultProfile(nickname ? stableSeed(nickname) : undefined);
    return {
        nickname: nickname || generated.nickname,
        avatar: resolved ? resolved.avatar : generated.avatar,
        avatarData: resolved ? resolved.avatarData : '',
    };
}

module.exports = {
    AVATARS,
    AVATAR_CUSTOM,
    DEFAULT_KEY,
    MAX_AVATAR_DATA_CHARS,
    avatarDisplay,
    avatarEmoji,
    avatarOptions,
    createDefaultProfile,
    ensureDefaults,
    nextAvatar,
    normalizeAvatar,
    normalizeAvatarData,
    resolveAvatar,
    stableSeed,
};
