# dsh-think-effort

**中文（默认）** · [English](#english)

给 DeepSeek Harness（DSH）加一套**声明式自动思考档位**：模型选择器里出现 `Auto`，普通步骤落到模型声明的默认档（DeepSeek 为 `high`），会话标题、上下文压缩、自动复审这类由 Harness 自己发起的廉价调用自动用 `low`。打开调试开关后，每次请求的档位决策会实时出现在会话界面的悬浮窗里，子代理的决策也在其中。

## 快速开始

### 先选运行方式

| 方式 | 适用场景 | 插件安装位置 |
| --- | --- | --- |
| Web（`dsh web`，浏览器打开） | 浏览器试用、远程机器 | `web` profile |
| 桌面端 DSH Desktop | 日常使用，推荐 | `desktop` profile，由桌面端独占管理 |

### Web：在线安装

```sh
dsh plugin --profile web add dsh-think-effort
dsh --profile web
```

### Web：离线安装

在联网机器上取包（任一来源）：

```sh
npm pack dsh-think-effort            # 产出 dsh-think-effort-<version>.tgz
# 或者从 GitHub Release 下载同名 .tgz
```

把 `.tgz` 拷到目标机后：

```sh
dsh plugin --profile web add /abs/path/dsh-think-effort-<version>.tgz
dsh --profile web
```

也可以解压后安装目录：`dsh plugin --profile web add /abs/path/dsh-think-effort`。

### Desktop：在线安装

DSH Desktop → **插件市场**搜索 `dsh-think-effort` 安装；或 **插件 → 添加插件 → 安装第三方插件**，填包名 `dsh-think-effort`。

> 桌面端的 `desktop` profile 由 Electron 应用独占管理，**不要**执行 `dsh plugin --profile desktop add ...`（会报 “profile desktop is managed exclusively by the Electron application”）。

### Desktop：离线安装

把 `.tgz`（或解压后的目录，根下要有 `package.json`）拷到目标机 → **插件 → 添加插件 → 安装第三方插件** → 填 `.tgz` 的绝对路径（界面会识别为「压缩包」），或填解压后的目录路径。目标机不需要 npm 或 GitHub。

### 启用与验证

1. **新安装不需要重启**：DSH 的 base bundle 默认启用 HMR，新 bundle 安装后直接激活（安装结果显示 `application: applied`）。打开 **插件** 页能看到「自动思考档位」即已生效；**设置** 面板的导航里也会多出同名入口。若页面是旧快照，刷新一次即可。
2. 输入框右侧的模型 chip 应从 `deepseek-v4.1-flash-1017` 变成 `deepseek-v4.1-flash-1017 High`（或你模型的默认档）。
3. 点开 chip →「推理等级」，应能看到 `Auto / Low / High / Max`。
4. 想核对具体模型，可让 Agent 调用只读工具 `reasoning_effort_status`，它会报告该模型声明的档位、默认档、`Auto` 与子代理的解析结果、廉价调用档位，不发送任何模型请求。

> **升级已安装版本**是另一回事：DSH 需要重启 Host 才能载入新的 JavaScript 模块代际（安装结果会报 `restart-required`）。这是 DSH 的进程模型，不是本插件的行为。

### 可视化设置

同一条配置有**两个入口**，表单与写入完全相同，改哪个都一样：

- **设置 → 自动思考档位**（推荐）：侧栏底部「更多」→ 设置，左侧导航里紧跟「内置插件」，带仪表盘图标；
- **插件 → 自动思考档位 → 行右侧「配置」**：正在浏览插件列表时顺手进入。

![设置面板里的入口](docs/settings-section.png)

![插件行的配置页](docs/settings.png)

- **档位分配**：普通步骤的 Auto 落点、模型默认档、**子代理推理强度**、哪些模型显示 Auto；
- **廉价调用**：总开关、档位、purpose 清单；
- **能力声明**：是否写入 `reasoningEfforts`、声明哪些档位、DeepSeek host/模型匹配规则；
- **调试**：会话界面的实时档位切换日志、stderr 诊断。

所有字段都是 `volatile` 配置：点「保存」后**立即生效**，不需要重启，也不用改 `cordis.patch.yml`。「设置」里的入口只在 Host 提供该行设置命名空间时出现，卸载或关闭本插件后不留空页面。

### 实时调试悬浮窗

设置页的「调试 → 在会话界面显示实时档位切换日志」打开后，会话右下角会出现一个可拖动的小窗口：

![设置页里的调试开关](docs/debug-settings.png)

![实时档位切换日志](docs/debug-overlay.png)

- **每次请求都记一条**：时间、用途（普通步骤 / 会话标题 / 压缩 / 自动复核）、请求档位（`Auto` 或具体档）、实际发送档位，以及模型；
- **子代理单独标记**：子代理会话由同一个 Host 处理，因此它的决策也在同一个窗口里，带「子」标记；
- **切换直观可见**：插件真正改写了档位（如 `auto → high`）的行高亮；同一会话同一用途的档位发生变化时，行尾出现 `⇄`；
- **筛选与复制**：可在「当前会话 / 全部会话 / 仅切换」之间切换，一键复制为文本，方便贴到 issue；
- **只记录、不改变请求**：关掉开关后日志立即停止记录，窗口消失；记录只存在 Host 内存里（最多 300 条），不写会话日志、不落盘。

窗口位置与展开状态记在浏览器本地，刷新页面后保持原样；「设置更新」「能力声明」也会作为事件出现在日志里，方便确认保存是否生效。

### 自动难度（实验）

默认**关闭**。打开后只对模型选择器里的 `Auto` 生效，不会覆盖你显式选的 `Low / High / Max`：

- **探索阶段降档**：先按默认档跑一轮；若这一轮思考很贵（`reasoningTokens ≥ 1500`，可调）且本轮还没开始写文件/执行命令，**后续请求降到 `Low`**；一旦出现写/执行就恢复默认档。状态按会话隔离，每轮重置。
  触发方式默认「自动」：供应商上报 reasoning tokens 时按阈值，**不上报时退回按轮次**（默认第一轮后触发）——很多 OpenAI 兼容网关不返回 reasoning tokens，这样才不会失效；也可以强制「按轮次」或「按思考 token」。
- **计划模式**：计划模式是显式信号，Auto 会落到 `High`（可改为别的档），避免规划时被降档。
- **不猜难度**：不看提示词、工具名或参数大小；只看“是否在探索”“上一轮思考多贵”“是否计划模式”这些确定性信号。
- **优先级**：廉价调用 → 固定子代理档位 → 自动策略 → Auto 默认；自动档位一律 clamp 到模型已声明词表。

设置页「自动难度（实验）」：总开关、探索降档开关/档位/触发方式/阈值/轮次、计划模式开关/档位。默认值 `auto / 1500 / 1 / Low / High`，建议先按默认跑几组任务，观察 HUD 里的「探索」标记再调。

![设置页里的自动难度开关](docs/adaptive-settings.png)

![探索阶段降档的实时日志](docs/adaptive-overlay.png)

> 这是从 Reasonix 的实验性 reasoning governor 移植过来的机制（其 v1.39.11 已退役 enforcement，只留 shadow 遥测），所以这里也默认关闭、标注实验：纯思考型任务在探索阶段降档可能降低质量。失败升档、按子代理深度/preset 的多层映射不在本版本范围。

### 本插件的第一次使用

装上后不需要额外配置：`Auto` 与档位由插件自动声明。选中 `Auto` 即按默认档运行；选 `Low / High / Max` 即固定该档；不选（原生「提供方默认」）在普通步骤上与 `Auto` 等效。

子代理默认**不干预**，保持 DSH 原生行为（继承父代理的模型与档位）。想让子代理固定用某一档，在设置页把「子代理 · 推理强度」改成 `Low / High / Max`，或选 `Auto` 跟随本插件的默认解析；廉价调用的降档仍然优先。

## 为什么需要它

手工在 `llm-pi-ai` 里声明的 DeepSeek 网关模型（例如走自建网关的 `deepseek-v4.1-flash-1017`）在 pi-ai 的已安装目录里查不到，profile 里也没写 `reasoningEfforts`，于是：

- 模型选择器只有模型名，没有任何思考档位；
- 任何 `reasoningEffort` 都会在请求前被 `UNSUPPORTED_REASONING_EFFORT` 拒绝。

同类插件通常只在模型**已经有**推理元数据时才追加 `Auto`，所以在这些网关上什么都不会出现。本插件先把能力声明补上，再谈切换。

## 它怎么工作

| 步骤 | 实现 |
| --- | --- |
| 识别 | host 后缀（`deepseek.com`）或模型 ID 正则（`^deepseek`，可用 `declareModels` 扩展） |
| 声明 | 向 `llm-pi-ai` 的 `providers.<route>.models[].reasoningEfforts` 写入 `{low, high, max}`，并在路由上写 `reasoning: high`；已有声明不覆盖；幂等 |
| `Auto` | 包装适配器的 `resolveModel`，在 `reasoning.efforts` 最前面插入 `{id:'auto',name:'Auto'}`，模型选择器即可显示 |
| 解析 | 包装 `prepareCall().stream`：`auto` → 声明默认档；`purpose ∈ auxPurposes` → `auxLevel`（未声明则回落默认档，且与会话选择无关）；显式档位不动 |
| 卸载 | 还原被替换的注册表条目，并把仍为 `auto` 的活动会话选择退回默认档 |

决策放在**适配器边界**，是因为 DSH 在插件看到这一步之前就固定了 `modelSelection`，而 `llm/stream` waterfall 的 `next()` 不接受新参数——只有适配器 facade 能改到「提供商真正收到的 options」。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖 `think-effort` 行（会完整替换 `config`，请写全要保留的字段）：

```yaml
- id: think-effort
  config:
    enabled: true
    declareCapability: true
    deepseekHosts: [deepseek.com]
    deepseekModelPattern: '^deepseek'
    declareModels: []
    efforts: [low, high, max]
    defaultEffort: high
    autoLevel: model-default
    auxDowngrade: true
    auxPurposes: [session-title, compaction, auto-review]
    auxLevel: low
    autoScope: all
    subagentLevel: inherit
    adaptiveEnabled: false
    adaptiveExploration: true
    adaptiveExplorationLevel: low
    adaptiveTrigger: auto
    adaptiveReasoningThreshold: 1500
    adaptiveMinRounds: 1
    adaptivePlanMode: true
    adaptivePlanLevel: high
    debugOverlay: false
    trace: false
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `declareCapability` | `true` | 是否写 `reasoningEfforts` |
| `deepseekHosts` | `['deepseek.com']` | 视为官方 DeepSeek 的 host 后缀 |
| `deepseekModelPattern` | `^deepseek` | 模型 ID 正则（网关别名用） |
| `declareModels` | `[]` | 额外要声明的 `provider/model` 或模型 ID 正则 |
| `efforts` | `low, high, max` | 声明给 DeepSeek 的档位 |
| `defaultEffort` | `high` | 路由默认档，`Auto` 落在这里 |
| `autoLevel` | `model-default` | 也可指定固定档位 |
| `auxDowngrade` | `true` | 廉价调用是否降档 |
| `auxPurposes` | `session-title, compaction, auto-review` | 视为廉价调用的 `purpose` |
| `auxLevel` | `low` | 廉价调用用的档位 |
| `autoScope` | `all` | `all` / `declared` / `off` |
| `subagentLevel` | `inherit` | 子代理档位：`inherit` / `auto` / `low`…`max`；固定档会覆盖子代理自身或继承的选择 |
| `debugOverlay` | `false` | 在会话界面显示实时档位切换日志（只记录，不改请求） |
| `trace` | `false` | 把决策写到 stderr（排查用） |

## 兼容性

- 只对 `llm-pi-ai` 路由声明能力；其他适配器（例如官方 DeepSeek 账户路由）本来就自带元数据，插件只补 `Auto`。
- 声明写进 profile 的用户层配置（与设置页编辑同一层）。若该行被更高层配置压住，写入会被拒绝并记录警告，此时手动在「设置 → 模型」里填写 `reasoningEfforts`（`low/high/max`）与默认档 `high` 即可。
- 不按工具名、参数大小或对话内容猜档位：这些信号不携带难度信息，一次猜低会被后续步骤继承。

## 许可

MIT。

---

## English

**中文简介**：给 DeepSeek Harness 加一套声明式自动思考档位——`Auto` 落到模型声明的默认档，廉价调用自动用低档。

Declarative automatic thinking depth for DeepSeek Harness: the model selector gains `Auto`, normal steps use the model's declared default depth (`high` on DeepSeek), and cheap host-owned calls — session titles, compaction, auto-review — drop to `low`. Turn on the debug switch and every request's effort decision appears live in a floating window over the conversation, subagent decisions included.

### Quick start

### Choose how you run DSH

| Mode | Use it for | Plugin location |
| --- | --- | --- |
| Web (`dsh web` in a browser) | Trying it out, remote machines | `web` profile |
| DSH Desktop | Daily use (recommended) | `desktop` profile, managed by the app |

### Web: online install

```sh
dsh plugin --profile web add dsh-think-effort
dsh --profile web
```

### Web: offline install

On a connected machine run `npm pack dsh-think-effort` (or download the `.tgz` from the GitHub release), copy it over, then:

```sh
dsh plugin --profile web add /abs/path/dsh-think-effort-<version>.tgz
```

An unpacked directory works too: `dsh plugin --profile web add /abs/path/dsh-think-effort`.

### Desktop: online install

DSH Desktop → **Plugin market** → search `dsh-think-effort`; or **Plugins → Add plugin → Install third-party plugin** and enter the package name.

> The `desktop` profile is managed exclusively by the Electron app. Do **not** run `dsh plugin --profile desktop add ...` — DSH rejects it.

### Desktop: offline install

Copy the `.tgz` (or an unpacked directory with `package.json` at its root) to the target machine, then **Plugins → Add plugin → Install third-party plugin** and enter the absolute path. The target machine needs neither npm nor GitHub.

### Enable and verify

1. A **fresh install needs no restart**: the base bundle enables HMR, so a new bundle activates immediately (`application: applied`). The "Automatic thinking depth" card appears under **Plugins**, and **Settings** gains a navigation entry of the same name; refresh the page if the list is stale.
2. The model chip next to the composer reads `<model> High` (the model's default depth) instead of the bare model id.
3. Open the chip → "Reasoning level": `Auto / Low / High / Max` are listed.
4. For a specific model, ask the agent to call the read-only `reasoning_effort_status` tool: it reports the declared depths, the default, what `Auto` and subagents resolve to, and the cheap-call depth, without sending a model request.

> **Upgrading an installed version** is different: DSH must restart the Host to load a fresh JavaScript module generation (`restart-required`). That is DSH's process model, not this plugin's behavior.

### Visual settings

The same form is reachable from **two places**; both read and write the identical configuration:

- **Settings → Automatic thinking depth** (recommended): sidebar foot → More → Settings; the entry sits right after "Built-in plugins" and carries a gauge icon;
- **Plugins → Automatic thinking depth → Configure** on the row, when you are already browsing plugins.

![The Settings entry](docs/settings-section.png)

![The Plugins row configuration](docs/settings.png)

- **Depth assignment**: the ordinary-step Auto target, the model default, the **subagent effort**, and which models offer Auto;
- **Cheap calls**: switch, level, and purpose list;
- **Capability declaration**: whether to write `reasoningEfforts`, which depths to declare, and the DeepSeek host/model rules;
- **Debug**: the conversation's live effort-switch log and stderr diagnostics.

Every field is `volatile`: **Save** applies immediately, without a restart and without hand-editing `cordis.patch.yml`. The Settings entry exists only while the Host serves this row's settings namespace, so disabling or removing the plugin leaves no empty page behind.

### Live debug window

Turn on **Debug → Show the live effort-switch log in the conversation** and a movable window appears at the conversation's bottom-right corner:

![The debug switch in Settings](docs/debug-settings.png)

![The live effort-switch log](docs/debug-overlay.png)

- **One line per request**: time, purpose (ordinary step / session title / compaction / auto-review), requested depth (`Auto` or an explicit level), the depth actually sent, and the model;
- **Subagents are marked**: subagent sessions run in the same Host process, so their decisions land in the same window with a `Sub` badge;
- **Switches stand out**: rows the plugin actually rewrote (for example `auto → high`) are highlighted, and a level change for the same session and purpose is marked `⇄`;
- **Filter and copy**: switch between this session, all sessions, and switches only; copy the log as text for an issue report;
- **Records only, never rewrites**: turning the switch off stops recording and hides the window; the journal lives in Host memory (300 records at most) and never touches the session log or disk.

The window's position and open state persist in the browser, so a page refresh keeps them. Settings updates and capability declarations also appear as events, which makes a save's effect easy to confirm.

### Automatic difficulty (experimental)

Off by default. When on it applies only to the selector's `Auto`; an explicit `Low / High / Max` is never overridden:

- **Exploration downgrade**: the first round runs at the default depth; if that round thought expensively (`reasoningTokens ≥ 1500`, configurable) and the turn has not written or executed anything yet, **later requests drop to `Low`**. The first write or local execution restores the default. State is per Session and resets every turn. The trigger defaults to `auto`: the reasoning threshold when the provider reports reasoning tokens, otherwise assistant rounds (most OpenAI-compatible gateways report none); `rounds` and `reasoning` force one rule.
- **Plan mode**: an explicit signal, so Auto maps to `High` (configurable) instead of being downgraded while planning.
- **No difficulty guessing**: prompt text, tool names, and argument sizes are never inspected; only deterministic signals (exploring, previous round's reasoning spend, plan mode) are used.
- **Precedence**: cheap calls → fixed subagent depth → adaptive policy → Auto default; every adaptive depth is clamped to the model's declared vocabulary.

Settings → Automatic thinking depth → **Automatic difficulty (experimental)**: master switch, exploration switch/depth/trigger/threshold/rounds, plan-mode switch/depth. Defaults are `auto / 1500 / 1 / Low / High`; run a few tasks with the HUD open and watch the `explore` badge before tuning.

![The automatic-difficulty settings](docs/adaptive-settings.png)

![The exploration downgrade in the live log](docs/adaptive-overlay.png)

> This ports Reasonix's experimental reasoning governor (v1.39.11 retired its enforcement path and kept only shadow telemetry), so it stays opt-in and marked experimental: downgrading pure-reasoning tasks during exploration can hurt quality. Failure escalation and depth/preset maps are out of scope for this release.

### Features

- Declares `reasoningEfforts` for DeepSeek models that carry none (gateway aliases included), so the selector finally has levels.
- `Auto` resolves to the declared default depth on every request; an explicit pick passes through untouched.
- **Subagent effort**: `inherit` keeps DSH's native behavior; `auto` follows this plugin's default; a fixed depth overrides the child's own or inherited pick.
- Cheap host-owned calls (`session-title`, `compaction`, `auto-review`) drop to `low` only when the model declares it, regardless of the session's own choice.
- Idempotent: a second boot writes nothing; unload restores the original adapter registrations and retires a durable `auto`.
- **Live debug window**: an opt-in, bounded, in-memory journal served over a Host route and rendered as a movable log over the conversation, subagent decisions included.
- **Automatic difficulty (experimental)**: an opt-in exploration downgrade and plan-mode elevation for `Auto`, with explicit selections, cheap calls, and fixed subagent depths always taking precedence.

### Configuration

Override the `think-effort` row in the profile's `cordis.patch.yml`; the fields are listed in the Chinese section above. `declareCapability`, `efforts`, `defaultEffort`, `auxPurposes`, `auxLevel`, `autoScope`, `subagentLevel`, `adaptiveEnabled`, `debugOverlay` and `trace` are the ones most often changed. Most users should use the visual settings page instead of editing this file.

### Compatibility

- Capability declaration targets `llm-pi-ai` routes; other adapters already carry metadata and only gain `Auto`.
- When a higher configuration layer overrides `llm-pi-ai`, the write is refused with a logged warning — fill `reasoningEfforts` (`low/high/max`) and default depth `high` by hand under Settings → Models.
- It never guesses a depth from tool names, argument sizes or conversation text.

### License

MIT.

<!-- author-tools:start -->

<!-- generated by scripts/sync-readmes.mjs from projects.json -->

## 同作者的其他插件 · More plugins by the same author

- **[DSH 声音与提醒](https://github.com/mhlywxl/dsh-coding-sound)**（`dsh-coding-sound`）— 用声音盯住 Agent：按输出文字演奏生成式背景音乐，完成、等待审批与工具执行各有可配置的提示音。
  <br />*[DSH coding sound](https://github.com/mhlywxl/dsh-coding-sound)* (`dsh-coding-sound`) — Generative background music and notification chimes for DeepSeek Harness: hear whether the agent is thinking, still working, or waiting for you.
- **[DSH 分屏工作区](https://github.com/mhlywxl/dsh-split-workspace)**（`dsh-split-workspace`）— 把 DSH 会话区拆成任意数量的原生窗格：左右、上下、田字 2×2 与自动网格，每个窗格都是独立会话。
  <br />*[DSH split workspace](https://github.com/mhlywxl/dsh-split-workspace)* (`dsh-split-workspace`) — Split the DSH conversation area into unlimited native panes — side by side, stacked, 2×2 and an automatic grid — each a real session with its own composer and streaming.

## 支持作者 · Support the author

如果这个项目帮你省下了盯屏幕的时间，欢迎请作者喝杯咖啡 ☕，或者给作者「充充电」⚡。金额随意，心意最重要。

*If this project saved you some screen time, you can buy the author a coffee ☕ or top up the author's battery ⚡. Any amount is welcome — the thought counts.*

<p align="center">
  <img src="https://raw.githubusercontent.com/mhlywxl/dsh-think-effort/main/sponsor/alipay.jpg" alt="支付宝收款码 / Alipay QR code" width="180" />
  <img src="https://raw.githubusercontent.com/mhlywxl/dsh-think-effort/main/sponsor/wechat.png" alt="微信收款码 / WeChat Pay QR code" width="180" />
</p>
<p align="center"><sub>支付宝 · 微信支付 / Alipay · WeChat Pay</sub></p>

<!-- author-tools:end -->
