// 昵称与头像默认值：纯函数回归。
const path = require('path');
const root = path.resolve(__dirname, '..');
const profile = require(path.join(root, 'utils/profile.js'));

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

const keys = profile.AVATARS.map((item) => item.key);

// 自动生成的昵称要能直接落库：非空、不超过 store 的 12 字上限。
for (let i = 0; i < 200; i += 1) {
    const generated = profile.createDefaultProfile(i * 37 + 1);
    if (!generated.nickname || generated.nickname.length > 12 || keys.indexOf(generated.avatar) < 0) {
        check('生成的昵称头像合法', false, generated);
        break;
    }
    if (i === 199) check('200 次生成都合法', true);
}

const seeded = profile.createDefaultProfile(7);
check('同一种子结果固定', profile.createDefaultProfile(7).nickname === seeded.nickname, seeded);
check('昵称带可爱主体', seeded.nickname.indexOf('的') > 0, seeded);

// 空 profile 补齐；齐全的 profile 不产生写入。
const blank = profile.ensureDefaults(null);
check('空资料补齐昵称', !!blank.nickname && blank.nickname.length > 0, blank);
check('空资料补齐头像', keys.indexOf(blank.avatar) >= 0, blank);
check('资料齐全返回 null', profile.ensureDefaults({ nickname: '有数', avatar: 'cat' }) === null);
check('缺头像按昵称稳定补齐', profile.ensureDefaults({ nickname: '有数' }).avatar
    === profile.ensureDefaults({ nickname: '有数' }).avatar);
check('未知头像被换掉', !!profile.ensureDefaults({ nickname: '有数', avatar: 'alien' }).avatar);

check('未知头像兜底小猫', profile.avatarEmoji('alien') === profile.AVATARS[0].emoji);
check('已知头像返回对应表情', profile.avatarEmoji('fox') === '🦊');
check('换头像循环一圈', profile.nextAvatar(keys[keys.length - 1]) === keys[0], profile.nextAvatar(keys[keys.length - 1]));
check('头像选项数量与列表一致', profile.avatarOptions().length === profile.AVATARS.length);

// 自定义上传头像：avatar 存 'custom'，图片本身是 data URI。
const CUSTOM = profile.AVATAR_CUSTOM;
const SAMPLE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==';
check('custom 是合法头像', profile.normalizeAvatar(CUSTOM) === CUSTOM);
check('custom 缺图时补内置头像',
    profile.ensureDefaults({ nickname: '有数', avatar: CUSTOM }).avatar !== CUSTOM);
check('custom 有图时视为齐全',
    profile.ensureDefaults({ nickname: '有数', avatar: CUSTOM, avatarData: SAMPLE }) === null);
check('合法 data URI 通过校验', profile.normalizeAvatarData(SAMPLE) === SAMPLE);
check('网络地址不当作头像图', profile.normalizeAvatarData('https://a.com/b.png') === '');
check('超长图片被拒', profile.normalizeAvatarData(
    'data:image/png;base64,' + 'A'.repeat(profile.MAX_AVATAR_DATA_CHARS)
) === '');
check('自定义头像渲染成图片', profile.avatarDisplay(CUSTOM, SAMPLE).image === SAMPLE);
check('自定义头像不再出 emoji', profile.avatarDisplay(CUSTOM, SAMPLE).emoji === '');
check('内置头像渲染成 emoji', profile.avatarDisplay('fox', '').emoji === '🦊');
check('custom 缺图回落到 emoji', !!profile.avatarDisplay(CUSTOM, '').emoji);

console.log('\nTOTAL PASS ' + passed);
