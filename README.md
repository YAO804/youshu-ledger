# 有数记账

原生微信小程序记账本。数据保存在 WorkBuddy 云服务（PostgreSQL），登录后按账号隔离，换设备可继续记账。

远程：`https://github.com/YAO804/youshu-ledger.git`

## 功能

- **明细**：按月切换，收入 / 支出 / 结余汇总，流水列表，长按删除，预算超支提示
- **记一笔**：支出 / 收入、金额、分类、支付账户、日期、备注
- **统计**：近 6 个月收支趋势、支出分类占比、预算进度
- **我的**：昵称、账目总数、设置入口、清空数据（二次确认）、退出登录
- **管理页**：支付账户与余额、分类管理、预算设置、周期记账、导入导出
- **附加能力**：预算与超支提醒、周期记账（启动懒触发 + 幂等）、CSV 账单导入、CSV 导出与分享

## 架构

| 位置 | 职责 |
| --- | --- |
| `utils/cloud.js` | 唯一 SDK 客户端，`createMiniProgramWorkBuddyCloud` + `endpoint` / `publishableKey` / `workBuddyOAuthClientId`（均取自 `publicConfig`），注入请求诊断适配器 |
| `utils/ledger-store.js` | 唯一数据访问门面，接口统一 `async` + `{ data, error }`；**页面零改动**，从单机版切到云版只替换了这一个文件 |
| `utils/workbuddy-data-access.js` | `createTableAccess` 单表 CRUD 封装，0 行命中视为失败 |
| `utils/workbuddy-cloud-diagnostics.js` | 云请求失败时输出到 vConsole |
| `components/login-panel/` | 邮箱验证码登录，发送与验证分离 |
| `pages/login/` | 登录页，提供邮箱验证码与「使用 WorkBuddy 登录」两种入口 |
| `app.js` | `onShow` 把完整 options 交给 SDK 处理授权回调；`ensureReady()` 做登录门禁、首次种子初始化、周期记账懒触发 |

所有业务查询前都先 `cloud.auth.getSession()`；未登录返回 `UNAUTHENTICATED`，页面统一跳转登录页。前端**不发送 `owner_id`**。

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
- CSV 导入支持标准列名（日期/时间、金额，可选收支、分类、账户、备注）。微信、支付宝账单多为 GBK，需先另存为 **UTF-8**，否则中文乱码。

## 登录

- **邮箱验证码**：可在预览中尝试收发验证码；尚未在真机 / 体验版验证。
- **使用 WorkBuddy 登录**：小程序原生授权，需要真机或体验版。H5 预览无法完成原生授权往返，也不能证明真机读写。

## 目录结构

```text
app.js / app.json / app.wxss      全局配置与样式
project.config.json               工程配置（miniprogramRoot: ./）
package.json                      云服务 SDK 依赖
utils/cloud.js                    唯一 SDK 客户端
utils/ledger-store.js             云数据层门面
utils/format.js                   金额与日期工具
utils/workbuddy-*.js              数据访问 / 请求诊断资产
components/login-panel/           邮箱验证码登录组件
pages/index|add|stats|mine/        四个 tab
pages/accounts|categories|budgets|recurring|data/   管理页
pages/login/                      登录页
tests/ledger-store.smoke.js       数据层冒烟测试
```

## 验证

```bash
node tests/ledger-store.smoke.js
```

22 项断言（内存模拟云数据面）覆盖：首次种子、记账与月汇总、账户余额聚合、统计、预算与超支、周期规则幂等、CSV 导入导出与重复跳过、昵称写入、清空数据。

数据库侧已确认：6 张表存在且 RLS 开启、6 条 owner-only 策略就位、`(owner_id, source_key)` 唯一索引存在、一次写入读回成功（验证数据已清理，`ledger_records` 现为 0 行）。

真实 SDK 连通性（用项目里的 `utils/cloud.js` + 真实 `publicConfig`，经官方 SDK 打真实 endpoint）：客户端初始化成功；未登录 `getSession()` 返回 `{ data: null, error: null }`；`ledger_records` 的 SELECT 返回 `HTTP 200` + `data: []`。说明公开配置有效、REST 数据面可达、未登录时读不到已有数据。

静态校验：10 个页面四件套齐全、JSON 合法、tabBar 路径均已声明、`usingComponents` 与 `require` 本地引用存在、无浏览器 API、无 WXML 非法表达式、所有 JS 通过 `node --check`。

### 已知边界

- 平台对未带 session 的请求返回 `auth.uid() = 'anon'`，因此绕过小程序、直接用 `publishableKey` 调 REST 的匿名写入能通过 `WITH CHECK` 并落到 `owner_id = 'anon'`（本次探测已验证，探测行已删除）。这类数据与登录用户数据隔离，但会共享同一个匿名命名空间。当前防线是业务层 `requireSession()`：所有 store 方法在未登录时返回 `UNAUTHENTICATED`，不发数据库请求。**真机登录跑通后，需复核是否把策略收紧到仅 `authenticated`**；注意平台允许匿名登录会话也使用 `anon` 角色，直接收紧可能误伤登录用户，不能仅凭猜测改。
- 以上是数据库与业务逻辑验证，**不等于微信原生编译、真机登录或真机读写验证**。本机未安装微信开发者工具；邮箱 OTP、WorkBuddy 小程序原生授权、登录后写入读回、退出后受保护数据不可访问，都需在体验版中完成。

## 本地运行

用微信开发者工具「导入项目」选择本目录（AppID 可用测试号），或在 WorkBuddy 内预览。`appid` 当前为 `touristappid`，正式发布前替换为自己的小程序 AppID。云服务客户端初始化只使用 `publicConfig` 中的公开配置；服务端密钥不下发到小程序。
