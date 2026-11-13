# 有数记账

家庭共享记账微信小程序。原生微信小程序工程，基于 `workbuddy-native-basic@1.0.0` 基础模板增量开发。

远程：`https://github.com/YAO804/youshu-ledger.git`

## 当前进度

| 阶段 | 状态 |
| --- | --- |
| Git 仓库初始化、关联远程 | 完成 |
| 原生工程骨架展开 | 完成 |
| 四个 tab 页面骨架（明细 / 记一笔 / 统计 / 我的） | 完成 |
| 云服务环境（数据库、登录、行级权限） | 待接入 |
| 业务数据读写与共享账本 | 未开始 |

页面目前是 UI 骨架，不含数据持久化。「保存」会明确提示数据层未接入，不会假装写入成功。

## 目录结构

```text
app.js / app.json / app.wxss     全局配置与样式
project.config.json              工程配置（miniprogramRoot: ./）
pages/index/                     明细：月汇总 + 流水
pages/add/                       记一笔：金额 / 收支 / 分类 / 账户 / 备注 / 日期
pages/stats/                     统计：趋势 / 分类占比 / 预算进度
pages/mine/                      我的：成员、账户、设置、导入导出入口
```

## 业务模型（规划）

金额一律用**整数分**存储。共享账本按 `household_id` 做行级权限隔离。

`household` / `member` / `account` / `category` / `record` / `budget` / `recurring_rule` / `import_batch`

设计约定：

- 账户不存可变余额，只存 `initial_balance`；余额 = 初始值 + Σ收入 − Σ支出，避免编辑账目导致漂移。
- 周期记账采用启动时按 `next_run_at` 补生成的懒触发 + 幂等键。
- 账单导入需处理微信 / 支付宝 CSV 的 GBK 编码；导出走小程序端生成 CSV + 系统分享。

## 本地运行

用微信开发者工具「导入项目」选择本目录（AppID 可用测试号），或在 WorkBuddy 内预览。`appid` 当前为 `touristappid`，正式发布前替换为自己的小程序 AppID。
