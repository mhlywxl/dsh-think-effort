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
      advanced: '高级',
      traceRow: '把每次决策写到 stderr',
      traceHint: '排查用；默认关闭。',
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
      advanced: 'Advanced',
      traceRow: 'Write every decision to stderr',
      traceHint: 'Diagnostics only; off by default.',
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
      'auxDowngrade', 'auxPurposes', 'auxLevel', 'subagentLevel', 'trace',
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
        h('details', { className: 'dte-details' },
          h('summary', null, t('advanced')),
          Row({
            key: 'trace',
            label: t('traceRow'),
            hint: t('traceHint'),
            children: Switch({ checked: current.trace === true, disabled: busy, label: current.trace === true ? t('on') : t('off'), onChange: (next) => patch('trace', next) }),
          })),
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
        return () => {
          offSection();
          offIcon();
        };
      }), 'think-effort: settings entry');
    }

    return { inject: ['slots', 'locale', 'configForms'], apply };
  },
});
