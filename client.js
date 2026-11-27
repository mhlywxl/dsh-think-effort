/**
 * Browser half of `dsh-think-effort`: the visual settings page for one row.
 *
 * The page renders in two places, from one form:
 *
 * - the Plugins page's `plugins.row.config` slot, keyed by
 *   `<package name>#<row id>`, so the bundle's row gains a Configure control;
 * - the Settings panel's `settings.section` slot, so the same options are
 *   reachable where a person looks for settings instead of only behind a
 *   bundle row.
 *
 * The page owner supplies `form`: the accepted Host values of this row plus one
 * revision-fenced `mutate`. Every field is volatile, so saving writes the
 * profile patch and the running policy follows without a restart. The Settings
 * entry reads the row's settings namespace through `configForms` and exists
 * only while the Host serves it, so a deployment without this row shows no
 * trace of the page.
 *
 * The layout follows the desktop reference implementation: purpose rows
 * (ordinary step, subagent, cheap calls) over a shared effort vocabulary, with
 * capability declaration in an advanced block. It is plain hyperscript with
 * theme tokens; nothing here imports another plugin's runtime.
 */

window.__ModuleLoader__.load({
  id: 'dsh-think-effort',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'think-effort';
    /** The bundle row this page belongs to; the row id is also the Host settings namespace. */
    const ROW_ID = 'think-effort';
    const ROW_KEY = `dsh-think-effort#${ROW_ID}`;
    /** Settings navigation section id; the shell pairs it with the icon of the same id. */
    const SECTION_ID = 'think-effort';
    /** Right after the built-in Plugins section (order 15): the plugin's own options. */
    const SECTION_ORDER = 16;
    /** Host route that serves the opt-in debug journal (see `src/debug.js`). */
    const DEBUG_PATH = '/think-effort/debug';
    const DEBUG_CLEAR_PATH = '/think-effort/debug/clear';
    /** The overlay's localStorage keys: a reopened page keeps the reader's window. */
    const DEBUG_OPEN_KEY = 'dte.debug.open';
    const DEBUG_POS_KEY = 'dte.debug.pos';
    const EFFORT_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const KNOWN_PURPOSES = ['session-title', 'compaction', 'auto-review'];

    const zh = {
      nav: '自动思考档位',
      intro: '按“用途”分配推理强度：普通步骤、子代理、Harness 自己的廉价调用。改动即时生效，不需要重启。',
      loading: '正在读取插件配置…',
      unavailable: '这个部署没有提供可编辑的插件配置（设置服务未挂载，或该行没有可实时编辑的字段）。',
      noForm: '这里没有拿到这个插件的配置表单；请在「插件」页打开本插件行的「配置」。',
      save: '保存',
      saving: '保存中…',
      saved: '已保存，立即生效。',
      reset: '恢复默认',
      resetConfirm: '把本插件所有被覆盖的字段恢复为默认值？',
      saveFailed: '保存被拒绝：可能被更高层配置覆盖，或值未通过校验。',
      resetFailed: '恢复默认被拒绝。',
      noChanges: '没有需要保存的改动。',
      unsaved: '有未保存的改动。',
      invalidPattern: '模型 ID 正则需要是合法的 JavaScript 正则。',
      invalidEfforts: '至少保留一个档位。',
      adaptiveThresholdInvalid: '触发阈值必须是非负数字。',
      adaptiveRoundsInvalid: '触发轮次必须是至少 1 的整数。',
      effortPicker: '自动思考档位',
      sectionPurpose: '档位分配',
      sectionPurposeHint: '每一类请求各自决定用什么强度；显式选择的具体档位不会被“普通步骤”覆盖。',
      autoRow: '普通步骤 · Auto 落到',
      autoRowHint: '模型选择器里的 Auto 在普通对话步骤上使用的档位。',
      defaultRow: '模型默认档',
      defaultRowHint: '路由声明的默认档；Auto 选“跟随默认档”时使用它，也是廉价调用降档的参照。',
      autoScopeRow: '哪些模型显示 Auto',
      autoScopeHint: 'all：所有模型；declared：只在本插件声明过能力的模型；off：完全不注入 Auto。',
      subagentRow: '子代理 · 推理强度',
      subagentRowHint: 'DSH 的子代理默认继承父代理的模型与档位。这里可以给子代理统一指定强度；“不干预”保持原生行为。恢复默认值也是“不干预”。',
      sectionAux: '廉价调用',
      auxSwitch: '把 Harness 自己的廉价调用降到低档',
      auxSwitchHint: '会话标题、压缩、自动复核这类有界的小请求，不应该继承会话的深度。',
      auxLevelRow: '廉价调用使用的档位',
      auxPurposesRow: '视为廉价调用的 purpose',
      auxPurposesHint: '按 LLM 请求的 purpose 匹配；勾选常见项，或在“其他”里补充。',
      auxOther: '其他（逗号分隔）',
      sectionCapability: '能力声明',
      capabilitySwitch: '为没有推理元数据的 DeepSeek 模型声明档位',
      capabilitySwitchHint: '写入 llm-pi-ai 的 reasoningEfforts 与路由默认档；已有声明绝不覆盖。',
      effortsRow: '声明的档位（按强度排序）',
      effortsHint: 'DeepSeek V4 原生为 low / high / max；取消勾选可移除不支持的档位。',
      hostsRow: 'DeepSeek 端点后缀',
      hostsHint: '逗号分隔；默认 deepseek.com。只做 host 后缀匹配，子域名也算。',
      patternRow: '模型 ID 正则',
      patternHint: '网关别名用，例如 ^deepseek；不区分大小写。',
      declareModelsRow: '额外声明',
      declareModelsHint: '每行一个 provider/model，或一个模型 ID 正则；用于没有匹配到上面两条规则的网关。',
      sectionAdaptive: '自动难度（实验）',
      adaptiveSectionHint: '默认关闭。只对模型选择器里的 Auto 生效：显式选的档位永远优先，也不会根据提示词或工具名猜难度。',
      adaptiveEnabledRow: '启用自动难度',
      adaptiveEnabledHint: '打开后才按下面的规则升降档；关闭时与原行为完全一致。',
      adaptiveExplorationRow: '探索阶段降档',
      adaptiveExplorationHint: '先按默认档跑一轮；若这一轮思考很贵且还没开始写文件或执行命令，后续请求降到探索档；一旦出现写/执行就恢复默认档。',
      adaptiveExplorationLevelRow: '探索阶段使用的档位',
      adaptiveThresholdRow: '触发阈值（上一轮 reasoning tokens）',
      adaptiveThresholdHint: '默认 1500；仅当触发方式使用思考 token 时生效。',
      adaptiveTriggerRow: '触发方式',
      adaptiveTriggerHint: '自动：供应商上报 reasoning tokens 时按阈值，否则按轮次（多数网关不报 reasoning tokens）；轮次：只看本轮助手消息数；思考 token：只按 reasoning tokens。',
      adaptiveTriggerAuto: '自动（优先思考 token）',
      adaptiveTriggerRounds: '按轮次',
      adaptiveTriggerReasoning: '按思考 token',
      adaptiveMinRoundsRow: '触发轮次（本轮助手消息数）',
      adaptiveMinRoundsHint: '默认 1：第一轮之后、仍在探索时降档。',
      adaptivePlanRow: '计划模式使用高档',
      adaptivePlanHint: '计划模式下显式提高档位，避免把“探索”误降；不想要可以关闭。',
      adaptivePlanLevelRow: '计划模式使用的档位',
      sectionParallel: '并行工作（实验）',
      parallelSectionHint: '独立于档位策略：开启后向每个会话的系统提示注入一段“先拆分、再并行”的规则，让模型在合适时用 subagent / workflow 并行，而不是串行做完所有事。',
      parallelEnabledRow: '启用并行工作策略',
      parallelEnabledHint: '默认关闭；切换后下一步请求即生效，不需要重启。只改变模型行为，不给额外工具权限。',
      parallelWriteFanoutRow: '写任务扇出上限',
      parallelWriteFanoutHint: '建议 2–4；策略会提示模型不要超过这个数量，避免同文件/共享状态冲突。',
      parallelReadFanoutRow: '只读任务扇出上限',
      parallelReadFanoutHint: '建议 4–8；只读调研/审查可以比写任务更宽。',
      parallelFanoutInvalid: '扇出上限必须是 1–8（写）/ 1–12（只读）之间的整数。',
      debugReasonExploration: '探索',
      debugReasonPlan: '计划',
      debugSection: '调试',
      debugSectionHint: '调试只记录、不改变任何请求：打开后，每次模型请求的档位决策都会实时出现在会话界面的悬浮窗里。',
      debugOverlayRow: '在会话界面显示实时档位切换日志',
      debugOverlayHint: '会话右下角出现悬浮调试窗：每条模型请求的用途、请求档位和实际发送档位都会实时记录，包括子代理会话和 Harness 的廉价调用。',
      debugTraceRow: '同时把决策写到 Host 的 stderr',
      debugTraceHint: '给开发者排查用；普通使用不需要。',
      debugPill: '档位调试',
      debugTitle: '思考档位 · 实时切换日志',
      debugLive: '记录中',
      debugPaused: '未开启',
      debugEmpty: '等待下一次模型请求…',
      debugDisabledOnHost: '表单已打开调试，但 Host 还没有注册调试接口。完全退出并重新打开 DeepSeek Harness 后生效。',
      debugLoadFailed: '读取调试日志失败：',
      debugClear: '清空',
      debugCopy: '复制',
      debugCopied: '已复制',
      debugCollapse: '收起',
      debugFilterCurrent: '当前会话',
      debugFilterAll: '全部会话',
      debugFilterSwitched: '仅切换',
      debugCount: '共 {n} 条',
      debugSubagent: '子',
      debugKindConfig: '设置更新',
      debugKindCapability: '能力声明',
      debugModelDefault: '模型默认',
      debugPurposeAgent: '普通步骤',
      debugPurposeTitle: '会话标题',
      debugPurposeCompaction: '压缩',
      debugPurposeReview: '自动复核',
      debugUnknown: '未知',
      debugSwitch: '切换',
      enabledRow: '启用插件',
      enabledHint: '总开关；关闭后不注入 Auto、不改写任何请求。',
      summary: 'Auto → {auto} · 子代理 → {sub} · 廉价调用 → {aux}',
      inherit: '不干预（原生行为）',
      auto: 'Auto（按默认档）',
      followDefault: '跟随默认档',
      on: '开',
      off: '关',
      all: '所有模型',
      declared: '仅声明过的模型',
      disabled: '已关闭',
      custom: '自定义',
      otherLevel: '其他档位',
    };

    const en = {
      nav: 'Automatic thinking depth',
      intro: 'Assign thinking depth by purpose: ordinary steps, subagents, and the Harness\'s own cheap calls. Changes apply immediately, without a restart.',
      loading: 'Reading plugin configuration…',
      unavailable: 'This deployment exposes no editable plugin configuration (the settings service is not mounted, or this row has no live fields).',
      noForm: 'The configuration form for this row is not available here. Open the plugin row\'s Configure control on the Plugins page.',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved. It applies immediately.',
      reset: 'Restore defaults',
      resetConfirm: 'Restore every overridden field of this plugin to its default?',
      saveFailed: 'The save was refused: a higher configuration layer may override this row, or a value failed validation.',
      resetFailed: 'Restoring defaults was refused.',
      noChanges: 'Nothing to save.',
      unsaved: 'Unsaved changes.',
      invalidPattern: 'The model-id pattern must be a valid JavaScript regular expression.',
      invalidEfforts: 'Keep at least one depth.',
      adaptiveThresholdInvalid: 'The trigger threshold must be a non-negative number.',
      adaptiveRoundsInvalid: 'The trigger round must be an integer of at least 1.',
      effortPicker: 'Automatic thinking depth',
      sectionPurpose: 'Depth assignment',
      sectionPurposeHint: 'Each purpose chooses its own depth; an explicit pick is never overridden by the ordinary-step rule.',
      autoRow: 'Ordinary step · Auto resolves to',
      autoRowHint: 'The depth the model selector\'s Auto uses for ordinary conversation steps.',
      defaultRow: 'Model default depth',
      defaultRowHint: 'The route\'s declared default. Used when Auto follows the default, and as the reference for cheap-call downgrades.',
      autoScopeRow: 'Which models offer Auto',
      autoScopeHint: 'all: every model; declared: only models this plugin declared; off: do not inject Auto at all.',
      subagentRow: 'Subagent · reasoning effort',
      subagentRowHint: 'DSH subagents inherit the parent model and depth by default. Pin a depth for them here; "Do not intervene" keeps native behavior, and so does restoring this field.',
      sectionAux: 'Cheap calls',
      auxSwitch: 'Drop the Harness\'s own cheap calls to a low depth',
      auxSwitchHint: 'Session titles, compaction, and auto-review are bounded auxiliary requests and should not inherit the conversation\'s depth.',
      auxLevelRow: 'Depth used by cheap calls',
      auxPurposesRow: 'Purposes treated as cheap calls',
      auxPurposesHint: 'Matched against the LLM request purpose. Tick the common ones, or add more under "Other".',
      auxOther: 'Other (comma separated)',
      sectionCapability: 'Capability declaration',
      capabilitySwitch: 'Declare depths for DeepSeek models that carry no reasoning metadata',
      capabilitySwitchHint: 'Writes reasoningEfforts and the route default into llm-pi-ai. An existing declaration is never overwritten.',
      effortsRow: 'Declared depths (escalation order)',
      effortsHint: 'DeepSeek V4 declares low / high / max; untick a depth the endpoint does not support.',
      hostsRow: 'DeepSeek endpoint suffixes',
      hostsHint: 'Comma separated; deepseek.com by default. Matching is by host suffix, so subdomains count.',
      patternRow: 'Model-id pattern',
      patternHint: 'For gateway aliases, such as ^deepseek; case insensitive.',
      declareModelsRow: 'Extra declarations',
      declareModelsHint: 'One provider/model per line, or a model-id regular expression, for gateways the rules above miss.',
      sectionAdaptive: 'Automatic difficulty (experimental)',
      adaptiveSectionHint: 'Off by default. Applies only to the selector\'s Auto: an explicit depth always wins, and the policy never guesses from prompt text or tool names.',
      adaptiveEnabledRow: 'Enable automatic difficulty',
      adaptiveEnabledHint: 'When on, the rules below may change the depth; when off, behavior is exactly as before.',
      adaptiveExplorationRow: 'Lower depth during exploration',
      adaptiveExplorationHint: 'Run the first round at the default depth; if that round thought expensively and the turn has not started writing or executing yet, later requests drop to the exploration depth. The first write or local execution restores the default.',
      adaptiveExplorationLevelRow: 'Depth used while exploring',
      adaptiveThresholdRow: 'Trigger threshold (previous round\'s reasoning tokens)',
      adaptiveThresholdHint: '1500 by default; only used when the trigger rule reads reasoning tokens.',
      adaptiveTriggerRow: 'Trigger rule',
      adaptiveTriggerHint: 'auto: use the reasoning threshold when the provider reports reasoning tokens, otherwise count assistant rounds (most gateways report no reasoning tokens); rounds: count rounds only; reasoning: use reasoning tokens only.',
      adaptiveTriggerAuto: 'Auto (reasoning first)',
      adaptiveTriggerRounds: 'By round',
      adaptiveTriggerReasoning: 'By reasoning tokens',
      adaptiveMinRoundsRow: 'Trigger round (assistant messages this turn)',
      adaptiveMinRoundsHint: '1 by default: downgrade after the first round while still exploring.',
      adaptivePlanRow: 'Use a higher depth in plan mode',
      adaptivePlanHint: 'Plan mode raises the depth explicitly so exploration is not downgraded there; turn it off if not wanted.',
      adaptivePlanLevelRow: 'Depth used in plan mode',
      sectionParallel: 'Parallel work (experimental)',
      parallelSectionHint: 'Independent of the depth policy: when on, a short “split first, run independent units in parallel” rule is injected into every session\'s system prompt, so the model uses subagent / workflow where it fits instead of doing everything serially.',
      parallelEnabledRow: 'Enable the parallel-work policy',
      parallelEnabledHint: 'Off by default; the next request picks up the change without a restart. It only changes model behavior; it grants no extra tool permissions.',
      parallelWriteFanoutRow: 'Write-task fan-out cap',
      parallelWriteFanoutHint: '2–4 is a good default; the policy tells the model not to exceed it, limiting same-file and shared-state conflicts.',
      parallelReadFanoutRow: 'Read-only fan-out cap',
      parallelReadFanoutHint: '4–8 is a good default; read-only research and review can run wider than write tasks.',
      parallelFanoutInvalid: 'Fan-out caps must be integers: 1–8 for writes, 1–12 for read-only.',
      debugReasonExploration: 'explore',
      debugReasonPlan: 'plan',
      debugSection: 'Debug',
      debugSectionHint: 'Debugging records but never changes a request: when on, every effort decision appears live in a floating log over the conversation.',
      debugOverlayRow: 'Show the live effort-switch log in the conversation',
      debugOverlayHint: 'A floating debug window appears at the conversation\'s bottom-right corner: each model request\'s purpose, requested depth, and the depth actually sent, including subagent sessions and the Harness\'s cheap calls.',
      debugTraceRow: 'Also write decisions to the Host\'s stderr',
      debugTraceHint: 'For developer diagnostics; not needed for normal use.',
      debugPill: 'Effort debug',
      debugTitle: 'Thinking depth · live switch log',
      debugLive: 'Recording',
      debugPaused: 'Off',
      debugEmpty: 'Waiting for the next model request…',
      debugDisabledOnHost: 'The form has debugging on, but the Host has not registered the debug route. Quit and reopen DeepSeek Harness to load it.',
      debugLoadFailed: 'Could not read the debug log: ',
      debugClear: 'Clear',
      debugCopy: 'Copy',
      debugCopied: 'Copied',
      debugCollapse: 'Collapse',
      debugFilterCurrent: 'This session',
      debugFilterAll: 'All sessions',
      debugFilterSwitched: 'Switches only',
      debugCount: '{n} entries',
      debugSubagent: 'Sub',
      debugKindConfig: 'Settings update',
      debugKindCapability: 'Capability declared',
      debugModelDefault: 'model default',
      debugPurposeAgent: 'Ordinary step',
      debugPurposeTitle: 'Session title',
      debugPurposeCompaction: 'Compaction',
      debugPurposeReview: 'Auto-review',
      debugUnknown: 'Unknown',
      debugSwitch: 'switched',
      enabledRow: 'Enable this plugin',
      enabledHint: 'Master switch; when off, no Auto is injected and no request is rewritten.',
      summary: 'Auto → {auto} · Subagent → {sub} · Cheap calls → {aux}',
      inherit: 'Do not intervene (native)',
      auto: 'Auto (default depth)',
      followDefault: 'Follow the model default',
      on: 'On',
      off: 'Off',
      all: 'All models',
      declared: 'Only declared models',
      disabled: 'Disabled',
      custom: 'Custom',
      otherLevel: 'Other depth',
    };

    const LEVEL_LABELS = {
      off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium',
      high: 'High', xhigh: 'Extra high', max: 'Max',
    };

    /** All fields the page edits, in display order. */
    const FIELDS = [
      'enabled', 'declareCapability', 'deepseekHosts', 'deepseekModelPattern',
      'declareModels', 'efforts', 'defaultEffort', 'autoLevel', 'autoScope',
      'auxDowngrade', 'auxPurposes', 'auxLevel', 'subagentLevel',
      'adaptiveEnabled', 'adaptiveExploration', 'adaptiveExplorationLevel',
      'adaptiveTrigger', 'adaptiveReasoningThreshold', 'adaptiveMinRounds',
      'adaptivePlanMode', 'adaptivePlanLevel',
      'parallelEnabled', 'parallelWriteFanout', 'parallelReadFanout',
      'debugOverlay', 'trace',
    ];

    function equal(a, b) {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    function asArray(value) {
      return Array.isArray(value) ? value : [];
    }

    function splitList(text) {
      return String(text ?? '')
        .split(/[\n,，;；]+/)
        .map((item) => item.trim())
        .filter((item, index, all) => item !== '' && all.indexOf(item) === index);
    }

    /** Whether a string is a usable regular expression for model-id matching. */
    function validPattern(text) {
      try {
        new RegExp(String(text ?? ''));
        return true;
      } catch {
        return false;
      }
    }

    /** Depth vocabulary of a draft, escalation-ordered, without auto/off. */
    function depthLevels(draft) {
      const declared = asArray(draft?.efforts).filter((id) => typeof id === 'string' && id !== 'auto' && id !== 'off');
      const extra = declared.filter((id) => !EFFORT_ORDER.includes(id));
      return [...EFFORT_ORDER.filter((id) => declared.includes(id)), ...extra];
    }

    /** Depth Auto resolves to for the draft. */
    function autoDepth(draft) {
      if (!draft || draft.autoLevel === 'model-default' || draft.autoLevel === undefined) return draft?.defaultEffort;
      return draft.autoLevel;
    }

    function levelLabel(level) {
      if (level === 'inherit') return null;
      return LEVEL_LABELS[level] ?? level;
    }

    function styleText() {
      return `
        .dte-page { display: flex; flex-direction: column; gap: 18px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.55; }
        .dte-intro { margin: 0; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
        .dte-summary { display: flex; flex-wrap: wrap; gap: 8px; }
        .dte-pill { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
        .dte-pill b { color: var(--dsw-alias-label-primary); font-weight: 600; }
        .dte-section { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; overflow: hidden; }
        .dte-section-head { padding: 12px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
        .dte-section-title { margin: 0; font-size: 13px; font-weight: 600; }
        .dte-section-hint { margin: 3px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
        .dte-row { display: grid; grid-template-columns: minmax(160px, 220px) minmax(0, 1fr); gap: 12px 18px; padding: 12px 14px; border-top: 1px solid var(--dsw-alias-border-l1); align-items: start; }
        .dte-row:first-child { border-top: 0; }
        .dte-row-label { padding-top: 5px; font-weight: 500; }
        .dte-row-hint { grid-column: 2; margin: -4px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
        .dte-control { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .dte-inline { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .dte-input, .dte-select, .dte-textarea {
          box-sizing: border-box; width: 100%; max-width: 520px; padding: 6px 9px;
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
          background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
          font: inherit; outline: none;
        }
        .dte-input:focus, .dte-select:focus, .dte-textarea:focus { border-color: var(--dsw-alias-brand-primary); }
        .dte-textarea { min-height: 68px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
        .dte-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 3px 10px; cursor: pointer; user-select: none; background: var(--dsw-alias-bg-base); }
        .dte-chip-on { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
        .dte-chip input { margin: 0; }
        .dte-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
        .dte-switch input { width: 15px; height: 15px; margin: 0; accent-color: var(--dsw-alias-brand-primary); }
        .dte-footer { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; position: sticky; bottom: 0; margin-top: 2px; padding: 12px 0 4px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); }
        .dte-btn { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 6px 16px; font: inherit; cursor: pointer; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
        .dte-btn:disabled { opacity: .55; cursor: default; }
        .dte-btn-primary { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-brand-primary); color: #fff; }
        .dte-status { font-size: 12px; }
        .dte-status-ok { color: var(--dsw-alias-state-success-primary); }
        .dte-status-error { color: var(--dsw-alias-state-error-primary); }
        .dte-status-muted { color: var(--dsw-alias-label-secondary); }
        .dte-details { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
        .dte-details > summary { cursor: pointer; padding: 11px 14px; font-weight: 600; }
        .dte-details[open] > summary { border-bottom: 1px solid var(--dsw-alias-border-l1); }
        .dte-details .dte-row:first-of-type { border-top: 0; }
        .dte-dbg-pill { position: fixed; right: 18px; bottom: 92px; z-index: 70; display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; box-shadow: 0 6px 18px rgba(0, 0, 0, .16); pointer-events: auto; }
        .dte-dbg-pill-count { min-width: 18px; padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); color: var(--dsw-alias-brand-primary); font-variant-numeric: tabular-nums; }
        .dte-dbg-card { position: fixed; right: 18px; bottom: 92px; z-index: 71; display: flex; flex-direction: column; width: min(440px, calc(100vw - 32px)); max-height: min(52vh, 480px); border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 16px 40px rgba(0, 0, 0, .22); pointer-events: auto; overflow: hidden; }
        .dte-dbg-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); cursor: grab; user-select: none; }
        .dte-dbg-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); flex: none; }
        .dte-dbg-dot-live { background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 22%, transparent); }
        .dte-dbg-title { font-size: 12px; font-weight: 600; }
        .dte-dbg-count { font-size: 11px; color: var(--dsw-alias-label-secondary); }
        .dte-dbg-head-actions { margin-left: auto; display: flex; gap: 4px; }
        .dte-dbg-btn { border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; padding: 2px 7px; cursor: pointer; }
        .dte-dbg-btn:hover { color: var(--dsw-alias-label-primary); }
        .dte-dbg-filters { display: flex; flex-wrap: wrap; gap: 6px; padding: 7px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
        .dte-dbg-chip { border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 2px 9px; font-size: 11px; cursor: pointer; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); }
        .dte-dbg-chip-on { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
        .dte-dbg-body { flex: 1 1 auto; min-height: 64px; overflow: auto; padding: 4px 0; }
        .dte-dbg-row { padding: 5px 12px; border-left: 2px solid transparent; font-size: 11px; }
        .dte-dbg-row + .dte-dbg-row { border-top: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 55%, transparent); }
        .dte-dbg-row-switched { border-left-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }
        .dte-dbg-line { display: flex; align-items: baseline; gap: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; overflow: hidden; }
        .dte-dbg-time { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
        .dte-dbg-badge { flex: none; border-radius: 4px; padding: 0 4px; font-size: 10px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent); color: var(--dsw-alias-state-warn-primary); }
        .dte-dbg-purpose { flex: none; color: var(--dsw-alias-label-secondary); }
        .dte-dbg-levels { overflow: hidden; text-overflow: ellipsis; }
        .dte-dbg-levels b { color: var(--dsw-alias-brand-primary); font-weight: 600; }
        .dte-dbg-meta { display: flex; gap: 8px; margin-top: 1px; font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; }
        .dte-dbg-meta span { overflow: hidden; text-overflow: ellipsis; }
        .dte-dbg-reason { flex: none; border-radius: 4px; padding: 0 4px; font-size: 10px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color: var(--dsw-alias-brand-primary); }
        .dte-dbg-reason-plan { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent); color: var(--dsw-alias-state-success-primary); }
        .dte-input-number { max-width: 180px; }
        .dte-dbg-empty { padding: 14px 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
        .dte-dbg-note { padding: 8px 12px; font-size: 11px; color: var(--dsw-alias-state-warn-primary); }
        .dte-dbg-foot { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-top: 1px solid var(--dsw-alias-border-l1); font-size: 10px; color: var(--dsw-alias-label-secondary); }
        .dte-dbg-foot-flash { color: var(--dsw-alias-state-success-primary); }
        @media (max-width: 720px) {
          .dte-row { grid-template-columns: minmax(0, 1fr); gap: 6px; }
          .dte-row-hint { grid-column: 1; }
          .dte-row-label { padding-top: 0; }
        }
      `;
    }

    function Section({ title, hint, children }) {
      return h('section', { className: 'dte-section' },
        h('div', { className: 'dte-section-head' },
          h('h3', { className: 'dte-section-title' }, title),
          hint ? h('p', { className: 'dte-section-hint' }, hint) : null),
        children);
    }

    function Row({ key, label, hint, children }) {
      return h('div', { key, className: 'dte-row' },
        h('div', { className: 'dte-row-label' }, label),
        h('div', { className: 'dte-control' }, children),
        hint ? h('p', { className: 'dte-row-hint' }, hint) : null);
    }

    function Switch({ checked, onChange, label, disabled }) {
      return h('label', { className: 'dte-switch' },
        h('input', { type: 'checkbox', checked: checked === true, disabled, onChange: (event) => onChange(event.target.checked) }),
        h('span', null, label));
    }

    function levelOptions(draft, includeAuto) {
      const levels = depthLevels(draft);
      return levels.map((id) => ({ value: id, label: LEVEL_LABELS[id] ?? id }));
    }

    function Select({ value, options, onChange, disabled }) {
      const known = options.some((option) => option.value === value);
      return h('select', { className: 'dte-select', value: value ?? '', disabled, onChange: (event) => onChange(event.target.value) },
        !known && value !== undefined && value !== '' ? h('option', { value, disabled: true }, String(value)) : null,
        options.map((option) => h('option', { key: option.value, value: option.value, disabled: option.disabled }, option.label)));
    }

    function Page({ form, t }) {
      const state = form?.state;
      const value = state?.value ?? {};
      const [draft, setDraft] = React.useState(null);
      const [dirty, setDirty] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [message, setMessage] = React.useState(null);
      const serialized = JSON.stringify(value);

      React.useEffect(() => {
        if (dirty) return;
        setDraft(JSON.parse(serialized));
      }, [serialized, dirty]);

      const current = draft ?? value;
      const levels = depthLevels(current);
      const levelChoices = levels.length > 0 ? levels : ['low', 'high', 'max'];
      const auto = autoDepth(current) ?? '(adapter default)';
      const sub = current.subagentLevel === 'inherit' || current.subagentLevel === undefined
        ? t('inherit')
        : current.subagentLevel === 'auto' ? t('auto') : levelLabel(current.subagentLevel);
      const aux = current.auxDowngrade === false ? t('off') : (levelLabel(current.auxLevel) ?? current.auxLevel);

      if (form === undefined) {
        return h('div', { className: 'dte-page' }, h('style', null, styleText()),
          h('p', { className: 'dte-intro' }, t('noForm')));
      }
      if (state?.status === 'loading') {
        return h('div', { className: 'dte-page' }, h('style', null, styleText()),
          h('p', { className: 'dte-intro' }, t('loading')));
      }
      if (state?.status === 'unavailable') {
        return h('div', { className: 'dte-page' }, h('style', null, styleText()),
          h('p', { className: 'dte-intro' }, t('unavailable')));
      }

      const patch = (field, next) => {
        setDirty(true);
        setMessage(null);
        setDraft({ ...(draft ?? value), [field]: next });
      };

      const validate = () => {
        if (asArray(current.efforts).length === 0) return t('invalidEfforts');
        if (!validPattern(current.deepseekModelPattern)) return t('invalidPattern');
        const threshold = current.adaptiveReasoningThreshold;
        if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0) return t('adaptiveThresholdInvalid');
        const rounds = current.adaptiveMinRounds;
        if (typeof rounds !== 'number' || !Number.isFinite(rounds) || rounds < 1) return t('adaptiveRoundsInvalid');
        const writeFanout = current.parallelWriteFanout ?? 4;
        if (typeof writeFanout !== 'number' || !Number.isInteger(writeFanout) || writeFanout < 1 || writeFanout > 8) return t('parallelFanoutInvalid');
        const readFanout = current.parallelReadFanout ?? 8;
        if (typeof readFanout !== 'number' || !Number.isInteger(readFanout) || readFanout < 1 || readFanout > 12) return t('parallelFanoutInvalid');
        for (const entry of asArray(current.declareModels)) {
          if (entry.includes('/')) continue;
          if (!validPattern(entry)) return t('invalidPattern');
        }
        return null;
      };

      const save = async () => {
        const invalid = validate();
        if (invalid !== null) {
          setMessage({ kind: 'error', text: invalid });
          return;
        }
        const ops = [];
        for (const field of FIELDS) {
          if (!equal(current[field], value[field])) {
            ops.push({ op: 'set', path: [field], value: current[field] });
          }
        }
        if (ops.length === 0) {
          setMessage({ kind: 'muted', text: t('noChanges') });
          return;
        }
        setBusy(true);
        try {
          const accepted = await form.mutate(ops, state.revision);
          if (accepted) {
            setDirty(false);
            setDraft(null);
            setMessage({ kind: 'ok', text: t('saved') });
          } else {
            setMessage({ kind: 'error', text: t('saveFailed') });
          }
        } catch (error) {
          setMessage({ kind: 'error', text: `${t('saveFailed')} ${error instanceof Error ? error.message : String(error)}` });
        } finally {
          setBusy(false);
        }
      };

      const reset = async () => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('resetConfirm'))) return;
        const user = state.user !== null && typeof state.user === 'object' ? state.user : {};
        const ops = FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(user, field))
          .map((field) => ({ op: 'unset', path: [field] }));
        if (ops.length === 0) {
          setMessage({ kind: 'muted', text: t('noChanges') });
          return;
        }
        setBusy(true);
        try {
          const accepted = await form.mutate(ops, state.revision);
          if (accepted) {
            setDirty(false);
            setDraft(null);
            setMessage({ kind: 'ok', text: t('saved') });
          } else {
            setMessage({ kind: 'error', text: t('resetFailed') });
          }
        } catch (error) {
          setMessage({ kind: 'error', text: `${t('resetFailed')} ${error instanceof Error ? error.message : String(error)}` });
        } finally {
          setBusy(false);
        }
      };

      const toggleEffort = (level) => {
        const declared = asArray(current.efforts);
        const next = declared.includes(level)
          ? declared.filter((id) => id !== level)
          : [...declared, level].sort((a, b) => {
            const ia = EFFORT_ORDER.indexOf(a);
            const ib = EFFORT_ORDER.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
          });
        patch('efforts', next);
      };

      const togglePurpose = (purpose) => {
        const purposes = asArray(current.auxPurposes);
        patch('auxPurposes', purposes.includes(purpose)
          ? purposes.filter((item) => item !== purpose)
          : [...purposes, purpose]);
      };

      const customPurposes = asArray(current.auxPurposes).filter((purpose) => !KNOWN_PURPOSES.includes(purpose));

      const autoOptions = [
        { value: 'model-default', label: t('followDefault') },
        ...levelChoices.map((id) => ({ value: id, label: LEVEL_LABELS[id] ?? id })),
      ];
      const subagentOptions = [
        { value: 'inherit', label: t('inherit') },
        { value: 'auto', label: t('auto') },
        ...levelChoices.map((id) => ({ value: id, label: LEVEL_LABELS[id] ?? id })),
      ];
      const scopeOptions = [
        { value: 'all', label: t('all') },
        { value: 'declared', label: t('declared') },
        { value: 'off', label: t('off') },
      ];
      const levelSelect = (field) => Select({
        value: current[field],
        options: levelChoices.map((id) => ({ value: id, label: LEVEL_LABELS[id] ?? id })),
        onChange: (next) => patch(field, next),
        disabled: busy,
      });

      // DeepSeek V4's native vocabulary first, then any extra level this row
      // already declares; never offer a standard level the endpoint lacks.
      const declaredEfforts = [...new Set(['low', 'high', 'max', ...asArray(current.efforts)])];

      return h('div', { className: 'dte-page' },
        h('style', null, styleText()),
        h('p', { className: 'dte-intro' }, t('intro')),
        h('div', { className: 'dte-summary' },
          h('span', { className: 'dte-pill' }, t('autoRow'), ' ', h('b', null, auto)),
          h('span', { className: 'dte-pill' }, t('subagentRow'), ' ', h('b', null, sub)),
          h('span', { className: 'dte-pill' }, t('sectionAux'), ' ', h('b', null, aux))),
        Section({
          title: t('sectionPurpose'),
          hint: t('sectionPurposeHint'),
          children: [
            Row({
              key: 'enabled',
              label: t('enabledRow'),
              hint: t('enabledHint'),
              children: Switch({ checked: current.enabled !== false, disabled: busy, label: current.enabled === false ? t('off') : t('on'), onChange: (next) => patch('enabled', next) }),
            }),
            Row({
              key: 'auto',
              label: t('autoRow'),
              hint: t('autoRowHint'),
              children: Select({ value: current.autoLevel ?? 'model-default', options: autoOptions, disabled: busy, onChange: (next) => patch('autoLevel', next) }),
            }),
            Row({
              key: 'default',
              label: t('defaultRow'),
              hint: t('defaultRowHint'),
              children: Select({ value: current.defaultEffort, options: levelChoices.map((id) => ({ value: id, label: LEVEL_LABELS[id] ?? id })), disabled: busy, onChange: (next) => patch('defaultEffort', next) }),
            }),
            Row({
              key: 'subagent',
              label: t('subagentRow'),
              hint: t('subagentRowHint'),
              children: Select({ value: current.subagentLevel ?? 'inherit', options: subagentOptions, disabled: busy, onChange: (next) => patch('subagentLevel', next) }),
            }),
            Row({
              key: 'scope',
              label: t('autoScopeRow'),
              hint: t('autoScopeHint'),
              children: Select({ value: current.autoScope ?? 'all', options: scopeOptions, disabled: busy, onChange: (next) => patch('autoScope', next) }),
            }),
          ],
        }),
        Section({
          title: t('sectionAux'),
          children: [
            Row({
              key: 'auxSwitch',
              label: t('auxSwitch'),
              hint: t('auxSwitchHint'),
              children: Switch({ checked: current.auxDowngrade !== false, disabled: busy, label: current.auxDowngrade === false ? t('off') : t('on'), onChange: (next) => patch('auxDowngrade', next) }),
            }),
            Row({
              key: 'auxLevel',
              label: t('auxLevelRow'),
              children: levelSelect('auxLevel'),
            }),
            Row({
              key: 'auxPurposes',
              label: t('auxPurposesRow'),
              hint: t('auxPurposesHint'),
              children: [
                h('div', { key: 'known', className: 'dte-inline' },
                  KNOWN_PURPOSES.map((purpose) => h('label', {
                    key: purpose,
                    className: 'dte-chip' + (asArray(current.auxPurposes).includes(purpose) ? ' dte-chip-on' : ''),
                  },
                  h('input', {
                    type: 'checkbox',
                    checked: asArray(current.auxPurposes).includes(purpose),
                    disabled: busy,
                    onChange: () => togglePurpose(purpose),
                  }),
                  h('code', null, purpose)))),
                h('input', {
                  key: 'other',
                  className: 'dte-input',
                  placeholder: t('auxOther'),
                  value: customPurposes.join(', '),
                  disabled: busy,
                  onChange: (event) => {
                    const known = asArray(current.auxPurposes).filter((purpose) => KNOWN_PURPOSES.includes(purpose));
                    patch('auxPurposes', [...known, ...splitList(event.target.value)]);
                  },
                }),
              ],
            }),
          ],
        }),
        Section({
          title: t('sectionCapability'),
          children: [
            Row({
              key: 'declare',
              label: t('capabilitySwitch'),
              hint: t('capabilitySwitchHint'),
              children: Switch({ checked: current.declareCapability !== false, disabled: busy, label: current.declareCapability === false ? t('off') : t('on'), onChange: (next) => patch('declareCapability', next) }),
            }),
            Row({
              key: 'efforts',
              label: t('effortsRow'),
              hint: t('effortsHint'),
              children: h('div', { className: 'dte-inline' },
                declaredEfforts.map((level) => h('label', {
                  key: level,
                  className: 'dte-chip' + (asArray(current.efforts).includes(level) ? ' dte-chip-on' : ''),
                },
                h('input', {
                  type: 'checkbox',
                  checked: asArray(current.efforts).includes(level),
                  disabled: busy,
                  onChange: () => toggleEffort(level),
                }),
                LEVEL_LABELS[level] ?? level))),
            }),
            Row({
              key: 'hosts',
              label: t('hostsRow'),
              hint: t('hostsHint'),
              children: h('input', {
                className: 'dte-input',
                value: asArray(current.deepseekHosts).join(', '),
                disabled: busy,
                placeholder: 'deepseek.com',
                onChange: (event) => patch('deepseekHosts', splitList(event.target.value)),
              }),
            }),
            Row({
              key: 'pattern',
              label: t('patternRow'),
              hint: t('patternHint'),
              children: h('input', {
                className: 'dte-input',
                value: current.deepseekModelPattern ?? '',
                disabled: busy,
                placeholder: '^deepseek',
                onChange: (event) => patch('deepseekModelPattern', event.target.value),
              }),
            }),
            Row({
              key: 'declareModels',
              label: t('declareModelsRow'),
              hint: t('declareModelsHint'),
              children: h('textarea', {
                className: 'dte-textarea',
                value: asArray(current.declareModels).join('\n'),
                disabled: busy,
                placeholder: 'my-gateway/deepseek-v4.1-flash-1017\n^deepseek-',
                onChange: (event) => patch('declareModels', splitList(event.target.value)),
              }),
            }),
          ],
        }),
        Section({
          title: t('sectionAdaptive'),
          hint: t('adaptiveSectionHint'),
          children: [
            Row({
              key: 'adaptiveEnabled',
              label: t('adaptiveEnabledRow'),
              hint: t('adaptiveEnabledHint'),
              children: Switch({ checked: current.adaptiveEnabled === true, disabled: busy, label: current.adaptiveEnabled === true ? t('on') : t('off'), onChange: (next) => patch('adaptiveEnabled', next) }),
            }),
            Row({
              key: 'adaptiveExploration',
              label: t('adaptiveExplorationRow'),
              hint: t('adaptiveExplorationHint'),
              children: Switch({ checked: current.adaptiveExploration !== false, disabled: busy, label: current.adaptiveExploration === false ? t('off') : t('on'), onChange: (next) => patch('adaptiveExploration', next) }),
            }),
            Row({
              key: 'adaptiveExplorationLevel',
              label: t('adaptiveExplorationLevelRow'),
              children: levelSelect('adaptiveExplorationLevel'),
            }),
            Row({
              key: 'adaptiveTrigger',
              label: t('adaptiveTriggerRow'),
              hint: t('adaptiveTriggerHint'),
              children: Select({
                value: current.adaptiveTrigger ?? 'auto',
                options: [
                  { value: 'auto', label: t('adaptiveTriggerAuto') },
                  { value: 'rounds', label: t('adaptiveTriggerRounds') },
                  { value: 'reasoning', label: t('adaptiveTriggerReasoning') },
                ],
                disabled: busy,
                onChange: (next) => patch('adaptiveTrigger', next),
              }),
            }),
            Row({
              key: 'adaptiveThreshold',
              label: t('adaptiveThresholdRow'),
              hint: t('adaptiveThresholdHint'),
              children: h('input', {
                className: 'dte-input dte-input-number',
                type: 'number',
                min: 0,
                step: 100,
                value: current.adaptiveReasoningThreshold ?? 1500,
                disabled: busy,
                onChange: (event) => patch('adaptiveReasoningThreshold', event.target.value === '' ? 0 : Number(event.target.value)),
              }),
            }),
            Row({
              key: 'adaptiveRounds',
              label: t('adaptiveMinRoundsRow'),
              hint: t('adaptiveMinRoundsHint'),
              children: h('input', {
                className: 'dte-input dte-input-number',
                type: 'number',
                min: 1,
                step: 1,
                value: current.adaptiveMinRounds ?? 1,
                disabled: busy,
                onChange: (event) => patch('adaptiveMinRounds', event.target.value === '' ? 1 : Number(event.target.value)),
              }),
            }),
            Row({
              key: 'adaptivePlan',
              label: t('adaptivePlanRow'),
              hint: t('adaptivePlanHint'),
              children: Switch({ checked: current.adaptivePlanMode !== false, disabled: busy, label: current.adaptivePlanMode === false ? t('off') : t('on'), onChange: (next) => patch('adaptivePlanMode', next) }),
            }),
            Row({
              key: 'adaptivePlanLevel',
              label: t('adaptivePlanLevelRow'),
              children: levelSelect('adaptivePlanLevel'),
            }),
          ],
        }),
        Section({
          title: t('sectionParallel'),
          hint: t('parallelSectionHint'),
          children: [
            Row({
              key: 'parallelEnabled',
              label: t('parallelEnabledRow'),
              hint: t('parallelEnabledHint'),
              children: Switch({ checked: current.parallelEnabled === true, disabled: busy, label: current.parallelEnabled === true ? t('on') : t('off'), onChange: (next) => patch('parallelEnabled', next) }),
            }),
            Row({
              key: 'parallelWriteFanout',
              label: t('parallelWriteFanoutRow'),
              hint: t('parallelWriteFanoutHint'),
              children: h('input', {
                className: 'dte-input dte-input-number',
                type: 'number',
                min: 1,
                max: 8,
                step: 1,
                value: current.parallelWriteFanout ?? 4,
                disabled: busy,
                onChange: (event) => patch('parallelWriteFanout', event.target.value === '' ? 1 : Number(event.target.value)),
              }),
            }),
            Row({
              key: 'parallelReadFanout',
              label: t('parallelReadFanoutRow'),
              hint: t('parallelReadFanoutHint'),
              children: h('input', {
                className: 'dte-input dte-input-number',
                type: 'number',
                min: 1,
                max: 12,
                step: 1,
                value: current.parallelReadFanout ?? 8,
                disabled: busy,
                onChange: (event) => patch('parallelReadFanout', event.target.value === '' ? 1 : Number(event.target.value)),
              }),
            }),
          ],
        }),
        Section({
          title: t('debugSection'),
          hint: t('debugSectionHint'),
          children: [
            Row({
              key: 'debugOverlay',
              label: t('debugOverlayRow'),
              hint: t('debugOverlayHint'),
              children: Switch({ checked: current.debugOverlay === true, disabled: busy, label: current.debugOverlay === true ? t('on') : t('off'), onChange: (next) => patch('debugOverlay', next) }),
            }),
            Row({
              key: 'trace',
              label: t('debugTraceRow'),
              hint: t('debugTraceHint'),
              children: Switch({ checked: current.trace === true, disabled: busy, label: current.trace === true ? t('on') : t('off'), onChange: (next) => patch('trace', next) }),
            }),
          ],
        }),
        h('div', { className: 'dte-footer' },
          h('button', { className: 'dte-btn dte-btn-primary', disabled: busy || !dirty, onClick: () => void save() }, busy ? t('saving') : t('save')),
          h('button', { className: 'dte-btn', disabled: busy, onClick: () => void reset() }, t('reset')),
          message !== null
            ? h('span', { className: `dte-status dte-status-${message.kind}` }, message.text)
            : h('span', { className: 'dte-status dte-status-muted' }, dirty ? t('unsaved') : '')));
    }

    function Summary({ form, t }) {
      const value = form?.state?.value ?? {};
      const auto = autoDepth(value) ?? '—';
      const sub = value.subagentLevel === 'inherit' || value.subagentLevel === undefined
        ? t('inherit')
        : value.subagentLevel === 'auto' ? t('auto') : levelLabel(value.subagentLevel);
      const aux = value.auxDowngrade === false ? t('off') : (levelLabel(value.auxLevel) ?? value.auxLevel ?? '—');
      return t('summary', { auto, sub, aux });
    }

    // ── floating debug log ───────────────────────────────────────────────────
    // The Host keeps the journal (one record per model request, including
    // subagent sessions); this half only polls it while the switch is on and
    // renders it in a movable window over the conversation. Nothing here reads
    // the session log, so the window shows decisions the log cannot carry.

    function storageGet(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }

    function storageSet(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* a page without storage keeps its default window placement */
      }
    }

    function readDebugPos() {
      const text = storageGet(DEBUG_POS_KEY);
      if (typeof text !== 'string' || text === '') return null;
      try {
        const value = JSON.parse(text);
        if (typeof value?.left === 'number' && typeof value?.top === 'number') return { left: value.left, top: value.top };
      } catch {
        /* an unusable saved position falls back to the corner */
      }
      return null;
    }

    /**
     * Base prefix for the debug route.
     *
     * Both real page carriers reach the route with a document-relative URL:
     * the browser GUI is served by the Host itself, and DSH Desktop loads the
     * page from `dsh-app://app/` whose protocol handler forwards every unknown
     * path to the Host with its authentication cookie. Turning that URL into
     * the advertised `http://127.0.0.1:<port>` origin instead makes the request
     * cross-origin, and because a plugin route cannot answer CORS the browser
     * reports "Failed to fetch". Only a page without such a carrier (a
     * `file://` shell or a worker preview) needs the advertised origin.
     * @returns {string} '' for a relative URL, or an origin prefix.
     */
    function debugBase() {
      let protocol = '';
      try {
        protocol = window.location.protocol;
      } catch {
        /* no location in a bare test realm */
      }
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'dsh-app:') return '';
      try {
        const transport = globalThis.__DSH_TRANSPORT__;
        if (transport !== null && typeof transport === 'object' && typeof transport.streamBaseUrl === 'string' && transport.streamBaseUrl !== '') {
          return new URL(transport.streamBaseUrl).origin;
        }
      } catch {
        /* an unusable carrier falls back to a relative URL */
      }
      return '';
    }

    /**
     * Fetch one debug-route path. A shell that owns the page transport (such as
     * a worker preview with a tunnel) carries the request itself; every other
     * page uses the browser's fetch against the relative URL.
     */
    function debugFetch(path, query, init) {
      const url = `${debugBase()}${path}${query ?? ''}`;
      const transport = globalThis.__DSH_TRANSPORT__;
      if (transport !== null && typeof transport === 'object' && typeof transport.fetch === 'function') return transport.fetch(url, init);
      return fetch(url, init);
    }

    function clockOf(at) {
      const date = new Date(typeof at === 'number' ? at : Date.now());
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function purposeLabel(purpose, t) {
      if (purpose === 'agent') return t('debugPurposeAgent');
      if (purpose === 'session-title') return t('debugPurposeTitle');
      if (purpose === 'compaction') return t('debugPurposeCompaction');
      if (purpose === 'auto-review') return t('debugPurposeReview');
      return typeof purpose === 'string' && purpose !== '' ? purpose : t('debugUnknown');
    }

    function shortModel(model) {
      const text = String(model ?? '');
      return text.length > 26 ? `${text.slice(0, 25)}…` : text;
    }

    function shortSession(entry) {
      if (typeof entry.title === 'string' && entry.title !== '') return entry.title;
      const id = typeof entry.sessionId === 'string' ? entry.sessionId : '';
      return id.length > 12 ? id.slice(0, 12) : id;
    }

    function clampNumber(value, low, high) {
      return Math.min(Math.max(value, low), high);
    }

    /** Subscribe to one config form without the slot framework's helper. */
    function useFormSnapshot(form) {
      const [snapshot, setSnapshot] = React.useState(() => form.getSnapshot());
      React.useEffect(() => {
        setSnapshot(form.getSnapshot());
        const dispose = form.subscribe(() => setSnapshot(form.getSnapshot()));
        return () => {
          if (typeof dispose === 'function') dispose();
        };
      }, [form]);
      return snapshot;
    }

    /** One line describing the live rules, shown in the window footer. */
    function debugSummary(value, t) {
      const auto = autoDepth(value) ?? '—';
      const sub = value?.subagentLevel === 'inherit' || value?.subagentLevel === undefined
        ? t('inherit')
        : value.subagentLevel === 'auto' ? t('auto') : (LEVEL_LABELS[value.subagentLevel] ?? value.subagentLevel);
      const aux = value?.auxDowngrade === false ? t('off') : (LEVEL_LABELS[value?.auxLevel] ?? value?.auxLevel ?? '—');
      return `Auto ${auto} · ${sub} · ${aux}`;
    }

    /** The settings snapshot a `volatile` save recorded in the journal. */
    function configText(entry, t) {
      const auto = entry.autoLevel === 'model-default' || entry.autoLevel === undefined ? entry.defaultEffort : entry.autoLevel;
      const sub = entry.subagentLevel === 'inherit' || entry.subagentLevel === undefined ? t('inherit') : entry.subagentLevel;
      const aux = entry.auxDowngrade === false ? t('off') : entry.auxLevel;
      const debug = entry.debugOverlay === true ? t('on') : t('off');
      return `${auto ?? '—'} · ${sub ?? '—'} · ${aux ?? '—'} · ${debug}`;
    }

    function debugRow(entry, t) {
      const switched = entry?.switched === true;
      const className = `dte-dbg-row${switched ? ' dte-dbg-row-switched' : ''}`;
      if (entry?.kind === 'config') {
        return h('div', { key: entry.seq, className },
          h('div', { className: 'dte-dbg-line' },
            h('span', { className: 'dte-dbg-time' }, clockOf(entry.at)),
            h('span', { className: 'dte-dbg-purpose' }, t('debugKindConfig')),
            h('span', { className: 'dte-dbg-levels' }, configText(entry, t))),
          h('div', { className: 'dte-dbg-meta' },
            h('span', null, `enabled ${entry.enabled === false ? 'off' : 'on'}`)));
      }
      if (entry?.kind === 'capability') {
        const declared = Array.isArray(entry.declared) ? entry.declared : [];
        const efforts = Array.isArray(entry.efforts) ? entry.efforts.join('/') : '—';
        return h('div', { key: entry.seq, className },
          h('div', { className: 'dte-dbg-line' },
            h('span', { className: 'dte-dbg-time' }, clockOf(entry.at)),
            h('span', { className: 'dte-dbg-purpose' }, t('debugKindCapability')),
            h('span', { className: 'dte-dbg-levels' }, `${declared.length} × ${efforts} → ${entry.defaultEffort ?? '—'}`)),
          h('div', { className: 'dte-dbg-meta' },
            h('span', { title: declared.join(', ') }, declared.join(', '))));
      }
      const requested = typeof entry?.requested === 'string' ? entry.requested : t('debugModelDefault');
      const applied = typeof entry?.applied === 'string' ? entry.applied : t('debugModelDefault');
      return h('div', {
        key: entry?.seq,
        className,
        title: `${entry?.provider ?? ''}/${entry?.model ?? ''}`,
      },
        h('div', { className: 'dte-dbg-line' },
          h('span', { className: 'dte-dbg-time' }, clockOf(entry?.at)),
          entry?.subagent === true ? h('span', { className: 'dte-dbg-badge' }, t('debugSubagent')) : null,
          h('span', { className: 'dte-dbg-purpose' }, purposeLabel(entry?.purpose, t)),
          entry?.reason === 'exploration'
            ? h('span', { className: 'dte-dbg-reason' }, t('debugReasonExploration'))
            : entry?.reason === 'plan'
              ? h('span', { className: 'dte-dbg-reason dte-dbg-reason-plan' }, t('debugReasonPlan'))
              : null,
          h('span', { className: 'dte-dbg-levels' }, requested, ' → ', h('b', null, applied)),
          entry?.changed === true
            ? h('span', { className: 'dte-dbg-purpose', title: `${entry.from ?? '—'} → ${applied}` }, '⇄')
            : null),
        h('div', { className: 'dte-dbg-meta' },
          h('span', null, shortModel(entry?.model)),
          h('span', { title: entry?.sessionId ?? '' }, shortSession(entry ?? {}))));
    }

    /**
     * The conversation's floating debug window.
     *
     * Rendered only while `debugOverlay` is on. It polls the Host journal as a
     * delta, keeps a bounded local copy, and groups nothing: the reader wants
     * the raw per-request decision, including subagent sessions, which share
     * the same Host process and therefore the same journal.
     */
    function DebugOverlay({ form, useSessions, t }) {
      const snapshot = useFormSnapshot(form);
      const enabled = snapshot?.status === 'ready' && snapshot.value?.debugOverlay === true;
      // The main-view Session is the one this conversation is showing; the
      // filter also admits its subagent descendants through the durable links.
      const current = typeof useSessions === 'function'
        ? useSessions((state) => {
            const rows = Object.values(state?.byId ?? {});
            for (const row of rows) {
              if (row !== null && typeof row === 'object' && (row.retainedBy?.mainView ?? 0) > 0) return row.id;
            }
            return null;
          })
        : null;
      const [open, setOpen] = React.useState(() => storageGet(DEBUG_OPEN_KEY) === '1');
      const [entries, setEntries] = React.useState([]);
      const [meta, setMeta] = React.useState({ enabled: false, latest: 0, error: null });
      const [filter, setFilter] = React.useState('current');
      const [flash, setFlash] = React.useState(null);
      const [pos, setPos] = React.useState(() => readDebugPos());
      const nextSeq = React.useRef(0);
      const flashTimer = React.useRef(null);

      React.useEffect(() => () => {
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      }, []);

      React.useEffect(() => {
        if (!enabled) return undefined;
        let stopped = false;
        let timer = null;
        const schedule = (delay) => {
          if (!stopped) timer = window.setTimeout(poll, delay);
        };
        const poll = () => {
          debugFetch(DEBUG_PATH, `?since=${String(nextSeq.current)}`, {
            cache: 'no-store',
            headers: { accept: 'application/json' },
          })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${String(response.status)}`))))
            .then((payload) => {
              if (stopped || payload === null || typeof payload !== 'object') return;
              if (payload.enabled === false) {
                setEntries([]);
                setMeta({ enabled: false, latest: 0, error: null });
                nextSeq.current = 0;
                return;
              }
              const reset = payload.reset === true;
              if (reset) setEntries([]);
              const fresh = Array.isArray(payload.entries) ? payload.entries : [];
              if (typeof payload.latest === 'number') nextSeq.current = payload.latest;
              if (fresh.length > 0) {
                setEntries((previous) => [...(reset ? [] : previous), ...fresh].slice(-300));
              }
              setMeta({ enabled: true, latest: typeof payload.latest === 'number' ? payload.latest : 0, error: null });
            })
            .catch((error) => {
              if (!stopped) setMeta((previous) => ({ ...previous, error: String(error?.message ?? error) }));
            })
            .finally(() => {
              schedule(open ? 700 : 2500);
            });
        };
        poll();
        return () => {
          stopped = true;
          if (timer !== null) window.clearTimeout(timer);
        };
      }, [enabled, open]);

      const flashText = (text) => {
        setFlash(text);
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => {
          flashTimer.current = null;
          setFlash(null);
        }, 1800);
      };

      if (!enabled) return null;

      const visible = entries.filter((entry) => {
        if (entry?.kind !== 'request') return filter !== 'switched';
        if (filter === 'switched') return entry.switched === true;
        if (filter === 'current' && current !== null) {
          return entry.sessionId === current || entry.parentSession === current || entry.rootSessionId === current;
        }
        return true;
      });

      const copy = () => {
        const text = visible.map((entry) => {
          if (entry?.kind === 'request') {
            return `${clockOf(entry.at)} ${entry.subagent === true ? '[sub]' : '[main]'} ${entry.provider}/${entry.model} ${entry.purpose ?? '-'} ${entry.requested ?? 'default'} -> ${entry.applied ?? 'default'}${entry.reason ? ` [${entry.reason}]` : ''}`;
          }
          if (entry?.kind === 'capability') return `${clockOf(entry.at)} [capability] ${(entry.declared ?? []).join(', ')}`;
          return `${clockOf(entry.at)} [config] ${configText(entry ?? {}, t)}`;
        }).join('\n');
        try {
          const write = navigator.clipboard?.writeText?.(text);
          if (write !== undefined) write.then(() => flashText(t('debugCopied'))).catch(() => undefined);
          else flashText(t('debugCopied'));
        } catch {
          /* a page without clipboard access simply cannot copy */
        }
      };

      const clear = () => {
        nextSeq.current = 0;
        setEntries([]);
        debugFetch(DEBUG_CLEAR_PATH, '', { method: 'POST', headers: { 'x-think-effort-debug': '1' } }).catch(() => undefined);
      };

      const collapse = () => {
        setOpen(false);
        storageSet(DEBUG_OPEN_KEY, '0');
      };

      const beginDrag = (event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (target !== null && typeof target?.closest === 'function' && target.closest('button') !== null) return;
        const card = event.currentTarget?.parentElement;
        if (card === null || card === undefined || typeof card.getBoundingClientRect !== 'function') return;
        const rect = card.getBoundingClientRect();
        const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const move = (moveEvent) => {
          const maxLeft = Math.max(0, (window.innerWidth || 0) - rect.width - 8);
          const maxTop = Math.max(0, (window.innerHeight || 0) - 48);
          setPos({
            left: clampNumber(moveEvent.clientX - offset.x, 8, maxLeft),
            top: clampNumber(moveEvent.clientY - offset.y, 8, maxTop),
          });
        };
        const end = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', end);
          window.removeEventListener('pointercancel', end);
          setPos((currentPos) => {
            if (currentPos !== null) storageSet(DEBUG_POS_KEY, JSON.stringify(currentPos));
            return currentPos;
          });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        event.preventDefault();
      };

      const filterChip = (id, label) => h('button', {
        type: 'button',
        key: id,
        className: 'dte-dbg-chip' + (filter === id ? ' dte-dbg-chip-on' : ''),
        onClick: () => setFilter(id),
      }, label);

      if (!open) {
        return h(React.Fragment, null, h('style', null, styleText()),
          h('button', {
            type: 'button',
            className: 'dte-dbg-pill',
            title: t('debugPill'),
            onClick: () => {
              setOpen(true);
              storageSet(DEBUG_OPEN_KEY, '1');
            },
          },
          h('span', { className: 'dte-dbg-dot' + (meta.enabled ? ' dte-dbg-dot-live' : '') }),
          t('debugPill'),
            entries.length > 0 ? h('span', { className: 'dte-dbg-pill-count' }, String(entries.length)) : null));
      }

      const style = pos === null
        ? undefined
        : { left: `${String(pos.left)}px`, top: `${String(pos.top)}px`, right: 'auto', bottom: 'auto' };
      return h(React.Fragment, null, h('style', null, styleText()),
        h('div', { className: 'dte-dbg-card', style },
        h('div', { className: 'dte-dbg-head', onPointerDown: beginDrag },
          h('span', { className: 'dte-dbg-dot' + (meta.enabled ? ' dte-dbg-dot-live' : '') }),
          h('span', { className: 'dte-dbg-title' }, t('debugTitle')),
          h('span', { className: 'dte-dbg-count' }, t('debugCount', { n: String(visible.length) })),
          h('div', { className: 'dte-dbg-head-actions' },
            h('button', { type: 'button', className: 'dte-dbg-btn', onClick: copy }, flash ?? t('debugCopy')),
            h('button', { type: 'button', className: 'dte-dbg-btn', onClick: clear }, t('debugClear')),
            h('button', { type: 'button', className: 'dte-dbg-btn', title: t('debugCollapse'), onClick: collapse }, '—'))),
        h('div', { className: 'dte-dbg-filters' },
          filterChip('current', t('debugFilterCurrent')),
          filterChip('all', t('debugFilterAll')),
          filterChip('switched', t('debugFilterSwitched'))),
        meta.error !== null
          ? h('div', { className: 'dte-dbg-note' }, `${t('debugLoadFailed')}${meta.error}`)
          : null,
        meta.error === null && meta.enabled !== true
          ? h('div', { className: 'dte-dbg-note' }, t('debugDisabledOnHost'))
          : null,
        h('div', { className: 'dte-dbg-body' },
          visible.length === 0
            ? h('div', { className: 'dte-dbg-empty' }, t('debugEmpty'))
            : [...visible].reverse().map((entry) => debugRow(entry, t))),
        h('div', { className: 'dte-dbg-foot' },
          h('span', null, debugSummary(snapshot.value ?? {}, t)),
          h('span', { style: { marginLeft: 'auto' } }, meta.enabled ? t('debugLive') : t('debugPaused')))));
    }

    /**
     * The Settings panel's copy of the page.
     *
     * The Plugins page receives `form` from its row owner; a Settings section
     * is owned by the shell and receives only `close`, so this copy reads the
     * row's settings form from the `configForms` service. Both surfaces share
     * that one form, so an edit belongs to the same profile write either way.
     */
    function SettingsSection({ useConfig, mutate, t }) {
      const state = useConfig((snapshot) => snapshot);
      const form = React.useMemo(() => ({ state, mutate }), [state, mutate]);
      return Page({ form, t });
    }

    /** Settings navigation glyph: a gauge arc with a needle, matching the bundle icon's motif. */
    function SectionIcon({ size }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M4.5 16.5a7.5 7.5 0 1 1 15 0' }),
        h('path', { d: 'M12 16.5 16 11.5' }),
        h('circle', { cx: 12, cy: 16.5, r: 1.6, fill: 'currentColor', stroke: 'none' }));
    }

    function apply(ctx) {
      const locale = ctx.get('locale');
      if (locale !== undefined) {
        ctx.effect(() => {
          const disposers = [];
          try {
            disposers.push(locale.register(NS, 'zh', zh), locale.register(NS, 'en', en));
          } catch {
            /* a locale registration failure must not hide the page */
          }
          return () => {
            for (const dispose of disposers) dispose();
          };
        }, 'think-effort: dictionaries');
      }
      const t = locale?.bind(NS) ?? ((key) => key);
      const slots = ctx.get('slots');
      if (slots === undefined) return;
      slots.inject('plugins.row.config', () => slots.register({
          name: 'plugins.row.config',
          key: ROW_KEY,
        }, (props) => props.view === 'summary'
        ? Summary({ form: props.form, t })
        : Page({ form: props.form, t })));
      // The same form under Settings: a bundle row alone is too hidden a home
      // for a plugin's options. The entry exists only while the Host serves
      // this row's settings namespace, so a profile without the row (or one
      // whose row exposes no volatile fields) shows no trace of the page.
      ctx.effect(() => ctx.configForms.whileServed([ROW_ID], () => {
        const form = ctx.configForms.get(ROW_ID);
        const offSection = slots.inject('settings.section', () => slots.register({
          name: 'settings.section',
          id: SECTION_ID,
          order: SECTION_ORDER,
          label: () => t('nav'),
          locale: NS,
          inject: () => ({
            mutate: (ops, revision) => form.mutate(ops, revision),
            hooks: {
              config: {
                getSnapshot: () => form.getSnapshot(),
                subscribe: (listener) => form.subscribe(listener),
              },
            },
            t,
          }),
        }, SettingsSection));
        const offIcon = slots.inject('settings.section.icon', () => slots.register({
          name: 'settings.section.icon',
          id: SECTION_ID,
          locale: NS,
        }, SectionIcon));
        // The floating debug log lives in the frame-wide overlay layer, above
        // every column, and renders only while the debug switch is on. It shares
        // the one form controller, so the switch it obeys is the same save.
        const offOverlay = slots.inject('shell.overlay', () => slots.register({
          name: 'shell.overlay',
          id: 'think-effort-debug',
          order: 40,
        }, (props) => DebugOverlay({ form, useSessions: props.useSessions, t })));
        return () => {
          offSection();
          offIcon();
          offOverlay();
        };
      }), 'think-effort: settings entry');
    }

    return { inject: ['slots', 'locale', 'configForms'], apply };
  },
});
