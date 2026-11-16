Component({
    properties: {
        // 已格式化的账目行，不要传原始 record。
        records: {
            type: Array,
            value: [],
        },
        empty: {
            type: String,
            value: '还没有账目',
        },
        hint: {
            type: String,
            value: '',
        },
    },

    methods: {
        onLongPress(event) {
            const id = event.currentTarget.dataset.id;
            if (!id) return;
            this.triggerEvent('delete', { id });
        },
    },
});
