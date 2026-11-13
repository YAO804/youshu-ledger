# 有数记账

原生微信小程序记账本。**无需注册登录，打开即可记账**；也可以登录后把试用账目同步到云端，换设备继续记。

远程：`https://github.com/YAO804/youshu-ledger.git`

## 两种使用模式

| 模式 | 触发条件 | 数据存放 | 能做什么 |
| --- | --- | --- | --- |
| 本地试用（默认） | 未登录，或云服务 SDK 未构建 | 本机 `wx.setStorageSync`，单 key `youshu_ledger_v1` | 全部记账功能，开箱即用 |
| 云端同步 | 登录成功 | WorkBuddy 云服务 PostgreSQL，按账号 RLS 隔离 | 全部功能 + 换设备继续记 |

门面 `utils/ledger-store.js` 在每次数据访问时判断 `cloud.auth.getSession()`：有 session 走云端实现，没有走本地实现。**页面代码完全不感知模式**。登录成功后 `migrateLocalToCloud()` 会把本地试用账目搬到云端；任一步失败都保留本地数据，绝不先清后传。

## 开箱即用

初始化会自动种入 4 个支付账户和 15 个收支分类，其中第一个是**「默认账户」**：

- 「记一笔」默认选中它和第一个分类，打开就能直接保存一笔，不用先去设置页添加账户。
- 「默认账户」在账户管理页带「默认」标记且不可删除；页面也保证至少保留一个账户。
- 本地试用模式下清缓存 / 卸载会丢数据，建议用「账单导入 / 数据导出」定期备份 CSV。

## 功能

- **明细**：按月切换，收入 / 支出 / 结余汇总，流水列表，长按删除，预算超支提示
- **记一笔**：支出 / 收入、金额、分类、支付账户、日期、备注
- **统计**：近 6 个月收支趋势、支出分类占比、预算进度
- **我的**：昵称、账目总数、当前模式、设置入口、清空数据（二次确认）、登录 / 退出
- **管理页**：支付账户与余额、分类管理、预算设置、周期记账、CSV 导入导出
- **附加能力**：预算与超支提醒、周期记账（启动懒触发 + 幂等）、CSV 账单导入、CSV 导出与分享

## 架构

| 位置 | 职责 |
| --- | --- |
| `utils/ledger-store.js` | 唯一数据访问门面，接口统一 `async` + `{ data, error }`；按 session 分发到下面两个实现 |
| `utils/ledger-store.local.js` | 本地试用实现，基于 `wx` storage |
| `utils/ledger-store.cloud.js` | 云端实现，`createTableAccess` + `cloud.database`，所有查询前 `requireSession()` |
| `utils/cloud.js` | 唯一 SDK 客户端；SDK require 失败时降级为不可用 stub，**不阻塞应用启动** |
| `utils/workbuddy-data-access.js` | `createTableAccess` 单表 CRUD 封装，0 行命中视为失败 |
| `utils/workbuddy-cloud-diagnostics.js` | 云请求失败时输出到 vConsole |
| `components/login-panel/` | 邮箱验证码登录，发送与验证分离 |
| `pages/login/` | 可选的登录页，登录后触发数据迁移，可随时「先不登录」 |
| `app.js` | `onShow` 把完整 options 交给 SDK 处理授权回调；`ensureReady()` 在两种模式下都能完成初始化 |

`utils/cloud.js` 只使用 `publicConfig` 的三个公开值（`endpoint` / `publishableKey` / `workBuddyOAuthClientId`），服务端密钥不下发。前端**不发送 `owner_id`**。

### 数据表（public，全部启用 RLS）

| 表 | 用途 |
| --- | --- |
| `ledger_accounts` | 支付账户与初始余额 |
| `ledger_categories` | 收支分类 |
| `ledger_records` | 账目主表（金额整数分，`source_key` 幂等） |
| `ledger_budgets` | 月度 / 分类预算 |
| `ledger_recurring_rules` | 周期规则 |
| `ledger_profiles` | 昵称 |

每张表 `owner_id TEXT NOT NULL DEFAULT auth.uid()`，单条 `FOR ALL` 策略 `USING / WITH CHECK (owner_id = auth.uid())`，并 GRANT 给 `authenticated, anon`。`ledger_records` 上有 `(owner_id, source_key)` 部分唯一索引，兜住周期记账与 CSV 重复导入。

### 设计约定

- 金额一律**整数分**（`BIGINT`），显示时由 `utils/format.js` 转换。
- 账户不存可变余额：`余额 = 初始余额 + Σ收入 − Σ支出`，编辑或删除账目不会导致漂移。
- 周期记账在 `ensureReady()` 里按 `nextRunAt` 补生成，用 `ruleId:date` 做幂等；日期上限 28 日。
- 本地 → 云端迁移复用 CSV 导入：按名称匹配账户 / 分类，`source_key` 去重，可重复执行。预算、周期规则里的本地 id 会映射成云端 id。
- CSV 导入支持标准列名（日期/时间、金额，可选收支、分类、账户、备注）。微信、支付宝账单多为 GBK，需先另存为 **UTF-8**，否则中文乱码。

## 登录（可选）

从「我的」页进入登录页，两种方式：

- **邮箱验证码**：`sendOtp` / `verifyOtp`，首次使用即自动注册，无需密码。
- **使用 WorkBuddy 登录**：小程序原生授权，需要真机或体验版；H5 预览无法完成原生授权往返。

登录页随时可以「先不登录，直接记账」。退出登录后回到本地试用模式。

## 目录结构

```text
app.js / app.json / app.wxss      全局配置与样式
project.config.json               工程配置（miniprogramRoot: ./）
package.json                      云服务 SDK 依赖
utils/cloud.js                    唯一 SDK 客户端（容错）
utils/ledger-store.js             数据层门面
utils/ledger-store.local.js       本地试用实现
utils/ledger-store.cloud.js       云端实现
utils/format.js                   金额与日期工具
utils/workbuddy-*.js              数据访问 / 请求诊断资产
components/login-panel/           邮箱验证码登录组件
pages/index|add|stats|mine/        四个 tab
pages/accounts|categories|budgets|recurring|data/   管理页
pages/login/                      可选登录页
tests/ledger-store.smoke.js       双模式数据层冒烟测试
```

## 验证

```bash
node tests/ledger-store.smoke.js
```

32 项断言（内存模拟 `cloud.database` 与 `wx` storage）覆盖：云端种子与记账、月汇总、余额聚合、统计、预算与超支、周期幂等、CSV 导入导出与去重、昵称、清空数据；以及**本地试用模式自动生效、未登录直接记账、登录后迁移到云端、迁移后本地清空、重复迁移不重复导入**。

数据库侧已确认：6 张表存在且 RLS 开启、6 条 owner-only 策略就位、`(owner_id, source_key)` 唯一索引存在、SQL 写入读回成功（验证数据已清理，`ledger_records` 0 行）。真实 SDK 连通性：客户端初始化成功，匿名 SELECT 返回 `HTTP 200 / data: []`。

静态校验：10 个页面四件套齐全、JSON 合法、tabBar 路径均已声明、无浏览器 API、所有 JS 通过 `node --check`。

### 已知边界

- 平台对未带 session 的请求返回 `auth.uid() = 'anon'`，绕过小程序直接用 `publishableKey` 调 REST 的匿名写入会落到 `owner_id = 'anon'`。这类数据与登录用户隔离，但共享匿名命名空间；当前防线是云版实现的 `requireSession()`。**不要贸然把策略收紧到只 `authenticated`**：匿名登录会话也使用 `anon` 角色，收紧可能误伤登录用户。
- 本机未安装微信开发者工具，**微信原生编译、真机 / 体验版、邮箱 OTP 真实收发、WorkBuddy 小程序原生授权往返、登录后真机写入读回、退出后受保护数据不可访问均未验证**。
- 当前是 owner-only 的账号私有账本，最初确认的「家庭/情侣共享」（household / member / 同组 RLS / 邀请流程）仍未实现。

## 本地运行

用微信开发者工具「导入项目」选择本目录（AppID 可用测试号），或在 WorkBuddy 内预览。`appid` 当前为 `touristappid`，正式发布前替换为自己的小程序 AppID。未构建 `miniprogram_npm` 时应用会自动进入本地试用模式，不会白屏；需要云同步时再执行小程序 npm 构建。
