// 自定义头像：选一张照片 → 居中裁成方形 → 缩到 240x240 → 变成 data URI。
// 存 data URI 而不是网络地址，真机上就不用配 request / downloadFile 合法域名。
const { MAX_AVATAR_DATA_CHARS } = require('./profile');

const TARGET_SIZE = 240;
// 先从高质量试，超限再降一档；两档都超限就退回原图。
const QUALITIES = [0.82, 0.6];

function choosePhoto() {
    return new Promise((resolve, reject) => {
        const done = (res) => {
            const file = (res && res.tempFiles && res.tempFiles[0]) || {};
            const first = res && res.tempFilePaths && res.tempFilePaths[0];
            const path = file.tempFilePath || first;
            if (path) resolve(path);
            else reject(new Error('没有取到图片'));
        };
        if (typeof wx.chooseMedia === 'function') {
            wx.chooseMedia({
                count: 1,
                mediaType: ['image'],
                sourceType: ['album', 'camera'],
                sizeType: ['compressed'],
                success: done,
                fail: reject,
            });
            return;
        }
        wx.chooseImage({
            count: 1,
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
            success: done,
            fail: reject,
        });
    });
}

function guessMime(filePath) {
    const lower = String(filePath || '').toLowerCase();
    if (lower.indexOf('.png') >= 0) return 'image/png';
    if (lower.indexOf('.webp') >= 0) return 'image/webp';
    return 'image/jpeg';
}

function readAsDataUri(filePath) {
    return new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
            filePath,
            encoding: 'base64',
            success: (res) => resolve('data:' + guessMime(filePath) + ';base64,' + res.data),
            fail: reject,
        });
    });
}

function drawToSquare(filePath, quality) {
    return new Promise((resolve, reject) => {
        if (typeof wx.createOffscreenCanvas !== 'function') {
            reject(new Error('NO_CANVAS'));
            return;
        }
        let canvas = null;
        try {
            canvas = wx.createOffscreenCanvas({ type: '2d', width: TARGET_SIZE, height: TARGET_SIZE });
        } catch (err) {
            reject(err);
            return;
        }
        const ctx = canvas.getContext('2d');
        const image = canvas.createImage();
        image.onload = () => {
            try {
                const width = image.width || TARGET_SIZE;
                const height = image.height || TARGET_SIZE;
                const side = Math.min(width, height);
                ctx.clearRect(0, 0, TARGET_SIZE, TARGET_SIZE);
                ctx.drawImage(
                    image,
                    (width - side) / 2, (height - side) / 2, side, side,
                    0, 0, TARGET_SIZE, TARGET_SIZE
                );
                resolve(canvas.toDataURL('image/jpeg', quality));
            } catch (err) {
                reject(err);
            }
        };
        image.onerror = () => reject(new Error('图片读不出来'));
        image.src = filePath;
    });
}

// 返回 { data, error }；用户取消选择时 error.code 为 'CANCELLED'，页面据此静默。
async function pickAvatarImage() {
    let filePath = '';
    try {
        filePath = await choosePhoto();
    } catch (err) {
        return { data: null, error: { code: 'CANCELLED', message: '' } };
    }

    for (let i = 0; i < QUALITIES.length; i += 1) {
        try {
            const uri = await drawToSquare(filePath, QUALITIES[i]);
            if (uri && uri.length <= MAX_AVATAR_DATA_CHARS) return { data: uri, error: null };
        } catch (err) {
            // 没有离屏 canvas 或绘制失败，直接走原图兜底。
            break;
        }
    }

    try {
        const raw = await readAsDataUri(filePath);
        if (raw.length <= MAX_AVATAR_DATA_CHARS) return { data: raw, error: null };
    } catch (err) {
        return { data: null, error: { code: 'READ_FAILED', message: '这张图读不出来，换一张试试' } };
    }
    return { data: null, error: { code: 'TOO_LARGE', message: '这张照片太大了，换一张试试' } };
}

module.exports = { pickAvatarImage };
