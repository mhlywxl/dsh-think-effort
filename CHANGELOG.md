# Changelog

## 0.5.0 — 2026-11-24

- **实时调试悬浮窗**：设置页新增「调试」区块与 `debugOverlay` 开关（默认关）。打开后，会话右下角出现可拖动的悬浮窗（`shell.overlay` 槽位），实时显示每次模型请求的档位决策：时间、用途、请求档位 → 实际发送档位、模型，以及子代理会话（带「子」标记）和 `设置更新` / `能力声明` 事件；支持「当前会话 / 全部会话 / 仅切换」筛选、一键复制、清空，窗口位置与展开状态在浏览器本地保存。
- **只记录、不改变请求**：Host 半边在适配器边界把每条决策写入内存环形缓冲（最多 300 条，不写会话日志、不落盘），经两条 `webServer` 路由（`GET /think-effort/debug?since=N`、`POST /think-effort/debug/clear`）提供增量读取与清空；开关关闭时路由返回 `enabled: false` 且不记录。
- 设置页原来的「高级」disclosure 改为「调试」区块，`trace`（stderr 诊断）移入其中。
- 测试：40 项全绿（新增调试日志 ring buffer/路由/清空契约、Host 决策记录、开关热更新、客户端悬浮窗注册与双语文案）。
- 文档：README / DETAIL（中英）新增悬浮窗说明与截图（`docs/debug-settings.png`、`docs/debug-overlay.png`）；`cordis.patch.yml` 与配置表补 `debugOverlay`。

## 0.4.0 — 2026-11-24

- **设置里多一个入口**：同一条配置现在注册进 DSH 设置面板的 `settings.section`（导航项「自动思考档位」，紧跟「内置插件」），并带一个仪表盘图标的 `settings.section.icon`。以前只能从「插件 → 自动思考档位 → 行 → 配置」进入，入口太深；两处共用同一份表单与同一次写入。
- **按需出现**：设置页入口通过 `configForms.whileServed(['think-effort'])` 注册，只在 Host 正在提供该行的设置命名空间时存在——没装这一行、或行里没有 volatile 字段的部署不会留下空页面。
- 浏览器半边的客户端模块 `inject` 增加 `configForms`，与插件管理器页面读取行配置的方式一致。
- 文档：README/DETAIL 更新两处入口与截图（`docs/settings-section.png`）；新增 `test/client.test.mjs` 静态守卫（设置的 slot、行键、命名空间、图标配对不得漂移）。
- 验证：一次性 web profile 里实测——设置导航出现「自动思考档位」，页面完整渲染，改「普通步骤 · Auto 落到」为 `max` 保存后 profile 的 `cordis.patch.yml` 出现对应覆盖；「插件 → 行 → 配置」入口保持可用。

## 0.3.0 — 2026-11-24

- **可视化设置页**：插件 → 自动思考档位 → 配置。覆盖全部字段（启用、Auto 落点、模型默认档、子代理强度、Auto 适用范围、廉价调用、能力声明、高级诊断），保存后即时生效。
- **子代理 effort**：新增 `subagentLevel`（`inherit` / `auto` / 固定档）。`inherit` 保持 DSH 原生继承；固定档覆盖子代理自身或从父代理继承的选择；廉价调用的降档仍然优先。`reasoning_effort_status` 同步报告子代理解析结果。
- **实时配置**：`export const Config` 声明全部字段为 `volatile`；设置写入经 `loader/volatile-update` 热更新策略，无需重启、无需手改 `cordis.patch.yml`。新增运行时依赖 `@deepseek-ai/schemastery`。
- **浏览器半边**：新增 `client.js`（`plugins.row.config` 键 `dsh-think-effort#think-effort`），中英双语文案，跟随 DSH 主题变量。
- 文档：明确**新安装免重启**（DSH base bundle 的 HMR 直接激活新 bundle）；升级已安装版本才需要重启 Host。
- 测试：26 项（新增子代理策略、volatile 配置热更新、子代理会话识别）。
- CI：提交 `package-lock.json`（从 npm registry 解析，不含本机路径），`test` 与 `release` 的 verify 任务先 `npm ci` 再跑语法检查与离线测试。此前的构建失败是 `index.js` 新增运行时依赖后 CI 未安装依赖（`ERR_MODULE_NOT_FOUND: @deepseek-ai/schemastery`）。

## 0.2.1 — 2026-11-24

- `package.json` 增加有界宿主声明 `engines.dsh: ">=0.2.0-rc.1 <0.3.0-0"`，插件市场与插件管理器可据此判断兼容性。
- 发布链路切换到 npm Trusted Publishing（OIDC + provenance），仓库不再保存 npm token。

## 0.2.0 — 2026-11-24

更名：包名与目录改为 **`dsh-think-effort`**，插件行 id 改为 `think-effort`，日志前缀与内部符号同步改名。行为与配置字段不变。
安装迁移：旧 bundle 先移除再安装新包；`llm-pi-ai` 里已写入的档位声明无需重做。

## 0.1.0 — 2026-11-24

首个版本：声明式思考档位（Auto / 默认档 / 廉价调用降档）。

- 按 endpoint / 模型 ID 自动为 `llm-pi-ai` 的 DeepSeek 模型声明 `reasoningEfforts`（`low / high / max`）与路由默认档 `high`；已有声明（包括 `false`）不覆盖。
- 模型选择器新增 `Auto`（适配器 `resolveModel` facade 注入）。
- 适配器边界逐请求解析：`auto` → 声明默认档；`session-title` / `compaction` / `auto-review` → `low`（仅当模型声明）；显式档位透传。
- 卸载时还原适配器注册表，并把仍为 `auto` 的活动会话选择退回默认档。
- 新增只读诊断工具 `reasoning_effort_status`。
- 能力声明幂等（第二次启动零写入），并提供 boot 重试、配置冲突重规划与 `trace` 诊断开关。
