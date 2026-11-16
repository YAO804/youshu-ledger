const store = require('../../utils/ledger-store');
const { seedSampleData } = require('../../utils/sample-data');

Page({
    data: {
        recordCount: 0,
        csvText: '',
        resultText: '',
        sampleText: '',
        exampleLines: [
            '日期,收支,金额,分类,账户,备注',
            '2026-11-01,支出,35.50,餐饮,微信,午餐',
            '2026-11-05,收入,8000,工资,银行卡,月薪',
        ],
    },

    async onShow() {
        const ready = await getApp().ensureReady();
        if (ready.error) {
            wx.showToast({ title: ready.error.message || '初始化失败', icon: 'none' });
            return;
        }
        const { data } = await store.getProfile();
        if (data) this.setData({ recordCount: data.recordCount });
    },

    onTextInput(event) {
        this.setData({ csvText: event.detail.value });
    },

    onSeedSample() {
        wx.showModal({
            title: '生成测试样例数据',
            content: '会先清空当前账本（本机或两人共享的云端），再写入 40 笔覆盖各种边界情况的账目，以及账户、自定义分类、预算和周期规则。确认继续？',
            confirmText: '生成',
            success: async (res) => {
                if (!res.confirm) return;
                await this.doSampleSeed();
            },
        });
    },

    async doSampleSeed() {
        wx.showLoading({ title: '写入中…', mask: true });
        const { data, error } = await seedSampleData(store);
        wx.hideLoading();
        if (error) {
            this.setData({ sampleText: '生成失败：' + error.message });
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({
            recordCount: data.records,
            sampleText: '已写入 ' + data.records + ' 笔账目、' + data.accounts + ' 个账户、'
                + data.categories + ' 个分类、' + data.budgets + ' 条预算、' + data.rules + ' 条周期规则。'
                + '覆盖 ' + data.months + '，回概览页即可看到效果。',
        });
        wx.showToast({ title: '样例数据已生成', icon: 'success' });
    },

    async buildCsv() {
        const { data, error } = await store.exportCsv();
        if (error) {
            wx.showToast({ title: error.message, icon: 'none' });
            return '';
        }
        if (!data.count) {
            wx.showToast({ title: '还没有账目可导出', icon: 'none' });
            return '';
        }
        return data.csv;
    },

    copyCsv(csv) {
        wx.setClipboardData({
            data: csv,
            success: () => wx.showToast({ title: '已复制 CSV', icon: 'none' }),
            fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
        });
    },

    async onCopy() {
        const csv = await this.buildCsv();
        if (csv) this.copyCsv(csv);
    },

    async onExport() {
        const csv = await this.buildCsv();
        if (!csv) return;
        if (typeof wx.shareFileMessage !== 'function') {
            this.copyCsv(csv);
            return;
        }
        const filePath = wx.env.USER_DATA_PATH + '/youshu-ledger-' + Date.now() + '.csv';
        try {
            wx.getFileSystemManager().writeFileSync(filePath, csv, 'utf8');
        } catch (e) {
            this.copyCsv(csv);
            return;
        }
        wx.shareFileMessage({
            filePath,
            fileName: '有数记账.csv',
            fail: () => this.copyCsv(csv),
        });
    },

    onChooseFile() {
        wx.chooseMessageFile({
            count: 1,
            type: 'file',
            extension: ['csv'],
            success: (res) => {
                if (!res.tempFiles || !res.tempFiles.length) return;
                wx.getFileSystemManager().readFile({
                    filePath: res.tempFiles[0].path,
                    encoding: 'utf8',
                    success: (result) => this.doImport(result.data),
                    fail: () => wx.showToast({ title: '读取失败，请确认是 UTF-8 编码', icon: 'none' }),
                });
            },
            fail: () => wx.showToast({ title: '未选择文件', icon: 'none' }),
        });
    },

    onImportText() {
        if (!this.data.csvText.trim()) {
            wx.showToast({ title: '请先粘贴 CSV 内容', icon: 'none' });
            return;
        }
        this.doImport(this.data.csvText);
    },

    async doImport(text) {
        const { data, error } = await store.importCsv(text);
        if (error) {
            this.setData({ resultText: '导入失败：' + error.message });
            wx.showToast({ title: error.message, icon: 'none' });
            return;
        }
        this.setData({
            resultText: '成功导入 ' + data.imported + ' 笔，跳过 ' + data.skipped + ' 行',
            csvText: '',
        });
        wx.showToast({ title: '导入完成', icon: 'success' });
        const profile = await store.getProfile();
        if (profile.data) this.setData({ recordCount: profile.data.recordCount });
    },
});
