# 有数记账

原生微信小程序记账本。**当前为单机版**：所有数据通过 `wx.setStorageSync` 保存在本机，不联网、不登录、不共享。

远程：`https://github.com/YAO804/youshu-ledger.git`

## 功能

- **明细**：按月切换，收入 / 支出 / 结余汇总，流水列表，长按删除，预算超支提示
- **记一笔**：支出 / 收入、金额、分类、支付账户、日期、备注
- **统计**：近 6 个月收支趋势、支出分类占比、预算进度
- **我的**：昵称、账目总数、各项设置入口、清空数据（二次确认）
- **管理页**：支付账户与余额、分类管理、预算设置、周期记账、导入导出
- **附加能力**：预算与超支提醒、周期记账（启动懒触发 + 幂等）、CSV 账单导入、CSV 导出与分享

## 数据层设计

`utils/ledger-store.js` 是**唯一的数据访问门面**，页面只调它，不直接读写 storage。

- 接口统一为 `async` + `{ data, error }`，错误不 reject；与云端 `createTableAccess` 形状一致。
- 页面已全部使用 `await`，将来接入云端时**只替换这一个文件**，UI 不用重写。
- 单一 storage key `youshu_ledger_v1`，整体读写，避免多 key 不同步。
- 金额一律用**整数分**存储，显示时由 `utils/format.js` 转换。
- 账户不存可变余额：`余额 = 初始余额 + Σ收入 − Σ支出`，编辑或删除账目不会导致漂移。
- 周期记账在 `app.js` 的 `ensureReady()` 里按 `nextRunAt` 补生成，用 `ruleId:date` 做幂等。

## 已确认的业务取舍

单机版下**家庭/情侣共享与多设备同步不可用**（原方案依赖云端）。数据只在这台设备的微信里，清除缓存或卸载会丢失；建议定期用「导入导出」备份 CSV。

后续若要恢复共享，需要开通云服务并建 `household` / `member` 等表，按 `household_id` 做行级权限隔离。

CSV 导入支持标准列名（日期/时间、金额，可选收支、分类、账户、备注）。微信、支付宝导出的账单多为 GBK，需先另存为 **UTF-8** 再导入，否则中文乱码。

## 目录结构

```text
app.js / app.json / app.wxss      全局配置与样式
project.config.json               工程配置（miniprogramRoot: ./）
utils/format.js                   金额（整数分）与日期工具
utils/ledger-store.js             本地数据层门面
pages/index/                      明细
pages/add/                        记一笔
pages/stats/                      统计
pages/mine/                       我的
pages/accounts/                   支付账户
pages/categories/                 分类管理
pages/budgets/                    预算设置
pages/recurring/                  周期记账
pages/data/                       导入导出
tests/ledger-store.smoke.js       数据层冒烟测试
```

## 验证

```bash
node tests/ledger-store.smoke.js
```

23 项断言覆盖：默认数据、记账与月汇总、账户余额聚合、统计、预算与超支、周期规则幂等、CSV 导入导出与重复跳过、清空数据。

静态校验：9 个页面四件套齐全、JSON 合法、tabBar 路径均已声明、无浏览器 API、无 WXML 非法表达式、所有 JS 通过 `node --check`。

> 以上是静态与数据层验证，**不等于微信原生编译或真机验证**。

## 本地运行

用微信开发者工具「导入项目」选择本目录（AppID 可用测试号），或在 WorkBuddy 内预览。`appid` 当前为 `touristappid`，正式发布前替换为自己的小程序 AppID。
