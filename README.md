# 有数记账

两个人的记账小程序。**打开即用：不用注册、不用登录、不用验证码、不用选模式。**

远程：`https://github.com/YAO804/youshu-ledger.git`

## 怎么用

打开就是**统计概览页**，本月花了多少、收了多少、钱花在哪些分类，一屏看完。点「记一笔」→ 选分类 / 账户 → 保存。内置「默认账户」和 15 个收支分类，不用先做任何配置。

- 云服务可用时，账目存在云端，**两个人打开就是同一本账**，实时共享。
- 云服务组件没加载时，自动退回本机账本，记账功能照常可用（此时两台设备不共享）。

> **共享账本没有鉴权**：这是刻意做的简化，代价是任何能打开这个小程序的人都能读写账目。只适合两个人私密使用，别把预览码或小程序随意外发。如果以后需要隔离，再加一层口令/账号即可。

## 功能

- **概览（首页）**：本月结余 / 收入 / 支出大卡，结余率、日均支出、最大支出分类、笔数四个指标，支出分类构成（堆叠条 + Top5 彩色条形），近 6 个月收支柱状趋势，账户余额、预算进度、最近账目
- **记一笔**：支出 / 收入、金额、分类、支付账户、日期、备注
- **统计**：完整的近 6 个月趋势、全部分类占比、预算进度
- **我的**：昵称、账目总数、设置入口、清空数据（二次确认）
- **管理页**：支付账户与余额、分类管理、预算设置、周期记账、CSV 导入导出
- **附加能力**：预算与超支提醒、周期记账（启动懒触发 + 幂等）、CSV 账单导入、CSV 导出与分享

### 首页概览的设计依据

参考 GitHub 上主流开源记账项目的 Dashboard 约定（FinTrack、miyu0201/personal-finance-tracker、NHasan143/monthly-expenses-tracker 等）：**首屏给财务健康度概览**——指标卡、分类构成、趋势、最近记录，并对空数据做安全处理。落到本项目：

- **聚合后置**：`getDashboard(month)` 在数据层一次算完所有派生指标（结余率、日均、Top5、堆叠占比），页面只渲染格式化结果，不塞原始记录进视图层。
- **不引图表库**：ECharts for WeChat 约 180KB+，wx-charts 约 32KB 且要处理 Canvas/Retina 兼容；两人用的小程序数据量小，继续用纯 WXML/WXSS 的堆叠条和柱状图，零依赖、包体积只增约 8KB。
- **颜色编码分类**：Top5 固定配色，与堆叠条、条形图、图例一致，便于快速识别最大支出。
- **空态安全**：没有任何账目时仍能正常渲染指标卡与占位文案，不崩、不出现 `NaN`。
- **可切换月份 / 展开全部流水**：概览默认只显示最近 5 笔，避免首屏过长；月份切换沿用原明细页交互。

## 架构

| 位置 | 职责 |
| --- | --- |
| `utils/ledger-store.js` | 唯一数据访问门面，接口统一 `async` + `{ data, error }`；按云服务是否可用选实现，另提供 `getDashboard(month)` 聚合首页概览 |
| `utils/dashboard.js` | 概览派生指标的纯函数（结余率 / 日均 / Top5 / 堆叠占比 / 最近记录），不依赖 `wx` 与云 API，可单测 |
| `utils/ledger-store.cloud.js` | 共享账本实现，`createTableAccess` + `cloud.database`，**无任何登录态检查** |
| `utils/ledger-store.local.js` | 云服务不可用时的本机兜底实现 |
| `utils/cloud.js` | 唯一 SDK 客户端；`require` 失败或能力残缺时安全降级，不阻塞启动 |
| `utils/workbuddy-data-access.js` / `workbuddy-cloud-diagnostics.js` | 单表 CRUD 封装 / 云请求失败诊断 |
| `app.js` | `ensureReady()` 做首次种子初始化与周期记账懒触发 |

匿名请求的 `auth.uid()` 恒为同一个值，配合 `owner_id DEFAULT auth.uid()` 的 RLS，两个人天然读写同一份数据，因此**不需要账号体系**。`utils/cloud.js` 只使用 `publicConfig` 的三个公开值，服务端密钥不下发，前端不发送 `owner_id`。

### 数据表（public，全部启用 RLS）

| 表 | 用途 |
| --- | --- |
| `ledger_accounts` | 支付账户与初始余额 |
| `ledger_categories` | 收支分类 |
| `ledger_records` | 账目主表（金额整数分，`source_key` 幂等） |
| `ledger_budgets` | 月度 / 分类预算 |
| `ledger_recurring_rules` | 周期规则 |
| `ledger_profiles` | 昵称 |

每张表 `owner_id TEXT NOT NULL DEFAULT auth.uid()`，单条 `FOR ALL` 策略 `USING / WITH CHECK (owner_id = auth.uid())`。`ledger_records` 上有 `(owner_id, source_key)` 部分唯一索引，兜住周期记账与 CSV 重复导入。

### 设计约定

- 金额一律**整数分**（`BIGINT`），显示时由 `utils/format.js` 转换。
- 账户不存可变余额：`余额 = 初始余额 + Σ收入 − Σ支出`，编辑或删除账目不会导致漂移。
- 周期记账在 `ensureReady()` 里按 `nextRunAt` 补生成，用 `ruleId:date` 做幂等；日期上限 28 日。
- CSV 导入支持标准列名（日期/时间、金额，可选收支、分类、账户、备注）。微信、支付宝账单多为 GBK，需先另存为 **UTF-8**，否则中文乱码。

## 目录结构

```text
app.js / app.json / app.wxss      全局配置与样式
project.config.json               工程配置（miniprogramRoot: ./）
package.json                      云服务 SDK 依赖
utils/cloud.js                    唯一 SDK 客户端（容错）
utils/ledger-store.js             数据层门面
utils/ledger-store.*.js           共享账本 / 本机兜底实现
utils/dashboard.js                首页概览聚合（纯函数）
utils/format.js                   金额与日期工具
pages/index|add|stats|mine/        四个 tab（index 为概览）
pages/accounts|categories|budgets|recurring|data/   管理页
tests/                            概览、数据层、SDK 降级、WXML 结构冒烟测试
```

## 验证

```bash
node tests/dashboard.smoke.js
node tests/ledger-store.smoke.js
node tests/cloud-fallback.smoke.js
node tests/wxml-structure.smoke.js
```

- **24 项**概览聚合断言：空态安全、结余率 / 日均 / 最大分类、Top5 与「其他」堆叠条归一化到 100%、配色与条形比例、最近 5 笔截断、负结余标红、透传趋势 / 预算 / 账户。
- **24 项**数据层断言（内存模拟 `cloud.database`）：种子与记账、月汇总、余额聚合、统计、预算与超支、周期幂等、CSV 导入导出与去重、昵称、清空数据；并断言**全流程未发生任何登录态检查**。
- **7 项** SDK 降级回归：模块缺失 / 能力残缺时安全降级，门面正确选择共享账本或本机账本。
- **9 个 WXML** 静态回归：禁止 `wx:else` / `wx:elif` 与 `wx:for` 同标签、禁止数组下标表达式。这类错误 H5 预览查不出，只有微信原生编译才报。
- 微信开发者工具 2.02.2609250 原生编译：`cli build-npm` + `cli preview` 通过，概览版包 **313.7 KB**（较上一版 +7.7 KB，无新增依赖）；此前自动化运行时确认过 `App()` 注册、页面栈正常、种子 4 账户（首项「默认账户」）+ 15 分类。
- 数据库侧：6 张表 RLS 开启、6 条 owner-only 策略、`(owner_id, source_key)` 唯一索引、SQL 写入读回成功（验证数据已清理）。

### 已知边界

- 匿名 REST 写入会落到 `owner_id = 'anon'`，这正是共享账本的机制；代价是所有匿名访问者共享同一命名空间，没有鉴权。
- **真机 / 体验版、两台设备同时读写的一致性、CSV 导出分享、账单文件导入，仍需手机扫预览码验证**。
- 本机兜底模式下清缓存 / 卸载会丢数据，建议用 CSV 定期备份。
- 当前是极简共享账本，没有成员、权限、邀请流程。

## 本地运行

用微信开发者工具「导入项目」选择本目录，或在 WorkBuddy 内预览。`project.config.json` 的 `appid` 已被工具自动写为 `wx2b204ff465b4935c`。首次编译需执行「工具 → 构建 npm」；`miniprogram_npm/` 已在 `.gitignore` 中，不入库。
