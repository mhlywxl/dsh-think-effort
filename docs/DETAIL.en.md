# Automatic thinking depth

Declarative thinking-depth control for DeepSeek (and other) reasoning models: the model selector gains `Auto`, `Auto` resolves to the model's declared default depth on every request (DeepSeek V4: `high`), and cheap host-owned calls — session titles, compaction, auto-review — drop to `low`.

## What it does

1. **Declares the capability (on by default).** A hand-declared DeepSeek gateway model under `llm-pi-ai` usually carries no reasoning metadata: the selector offers no depth, and any depth is refused. The plugin recognizes DeepSeek models by endpoint and model id and writes `reasoningEfforts` (default `low / high / max`) plus the route default depth (`high`) into the `llm-pi-ai` settings surface. A model that already declares `reasoningEfforts` — including an explicit `false` — is never touched.
2. **Offers `Auto`.** One `Auto` entry is prepended to the model's depth list.
3. **Resolves per request.** At the adapter boundary `auto` becomes the declared default; a request whose `purpose` is a cheap host-owned call becomes `low` when the model declares it — regardless of the session's own choice, because those bounded calls never inherit it; a manually picked depth passes through untouched and is validated by DSH itself.
4. **Subagent depth.** A subagent effort can be pinned (`inherit` / `auto` / `low`…`max`). `inherit` keeps DSH's native inheritance; a fixed depth overrides the child's own or inherited pick, while a cheap-call downgrade still wins.
5. **Live debug log.** An optional floating window shows every request's effort decision (requested → sent), subagent sessions included. It records only; it never changes a request.

## Usage

- Pick `Auto` in the model selector to state "use the default depth", or a concrete depth to pin it.
- Leaving the depth unset (the native "provider default" row) behaves like `Auto` on ordinary steps — both land on the declared default; `Auto` only records the intent in the session. The cheap-call downgrade applies either way.
- The recognized models, default depth and cheap-call list live in the plugin row's config (`think-effort` in `cordis.patch.yml`).
- The visual settings page has **two entries**, both editing the same form: **Settings → Automatic thinking depth** (recommended), or **Plugins → Automatic thinking depth → Configure** on the row. Every field is `volatile`, so Save applies immediately without a restart.

![The Settings entry](settings-section.png)

## Live debug log

Turn on **Debug → Show the live effort-switch log in the conversation** and a movable window (the `shell.overlay` seat) appears at the conversation's bottom-right corner, showing:

- each model request's time, purpose, requested depth, the depth actually sent, and the model;
- subagent sessions' decisions (with a `Sub` badge) — a subagent runs in the same Host process and therefore shares the one journal;
- `Settings update` and `Capability declared` events, so a save's effect is visible;
- filters for this session, all sessions, and switches only, plus one-click copy.

Two halves: the Host half appends each decision, at the adapter boundary, to an **in-memory ring buffer** (300 records at most, never written to the session log or disk) and serves it through two `webServer` routes — a cursor-based read and a clear; the browser half polls only while the switch is on, and keeps the window's position and open state in browser storage. With the switch off the routes answer `enabled: false`, the window disappears, and recording stops.

## Where the settings page comes from

- The row page registers into the plugin manager's `plugins.row.config`, keyed `dsh-think-effort#think-effort`.
- The Settings page registers into the settings panel's `settings.section` (same `id` `think-effort`, `order: 16`, right after the built-in Plugins section at 15); its glyph registers into `settings.section.icon` with the matching `id`.
- A Settings section receives no form from its owner, so the page reads the **row's settings namespace** (the profile entry id, `think-effort`) through the `configForms` service. `whileServed(['think-effort'])` registers the entry only while the Host serves that namespace, so a deployment without the row never shows an empty page.
- Both entries share one form controller inside `configForms`, so a save from either place is the same profile write.

## Limitations

- Capability declaration targets `llm-pi-ai` routes. Other adapters (for example the official DeepSeek account route) already carry metadata; the plugin only adds `Auto` there.
- The declaration is written into the profile's user layer, the same layer the Settings page edits. When that row is overridden by a higher layer (a `--patch` or home-patch override), the write is refused with a logged warning and `reasoningEfforts` has to be filled in by hand under Settings → Models.
- It never guesses a depth from tool names, argument sizes or conversation text: those signals carry no difficulty information, and a low guess is inherited by every later step.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch |
| `declareCapability` | `true` | Write `reasoningEfforts` |
| `deepseekHosts` | `['deepseek.com']` | Host suffixes treated as official DeepSeek |
| `deepseekModelPattern` | `^deepseek` | Model-id test for gateway aliases |
| `declareModels` | `[]` | Extra `provider/model` keys or model-id tests |
| `efforts` | `low, high, max` | Declared DeepSeek depth vocabulary |
| `defaultEffort` | `high` | Route default depth; where `Auto` lands |
| `autoLevel` | `model-default` | Or a fixed depth |
| `auxDowngrade` | `true` | Downgrade cheap host-owned calls |
| `auxPurposes` | `session-title, compaction, auto-review` | Purposes treated as cheap |
| `auxLevel` | `low` | Depth those calls request |
| `autoScope` | `all` | `all` / `declared` / `off` |
| `subagentLevel` | `inherit` | Subagent depth: `inherit` / `auto` / a fixed depth; a fixed depth overrides the child's own or inherited pick |
| `debugOverlay` | `false` | Live effort-switch log over the conversation (records only, never rewrites; 300 records in Host memory) |
| `trace` | `false` | Write decisions to stderr for diagnosis |

## Diagnostic tool

An Agent can call `reasoning_effort_status` for a provider/model: it reports the declared depths, the default, what `Auto` and subagents resolve to, and the cheap-call depth, without sending any model request.