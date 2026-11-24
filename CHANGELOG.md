# Changelog

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
