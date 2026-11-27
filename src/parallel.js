/**
 * The optional parallel-work policy injected into the system prompt.
 *
 * This module owns only the instruction text: it has no Host access and no
 * tool permissions. The switch lives in the row config, so turning it off
 * removes the text from the next assembled prompt without remounting anything.
 */

/**
 * Clamp one fan-out limit to the range the policy advertises.
 * @param {unknown} value raw config value.
 * @param {number} fallback default when the value is not a finite number.
 * @param {number} max largest allowed fan-out.
 * @returns {number} a positive integer.
 */
function fanout(value, fallback, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.round(value)));
}

/**
 * Build the parallel-work section text.
 *
 * The text is deliberately short: it is re-sent on every model request while
 * the switch is on, and long policy prose costs more than it saves.
 * @param {object} [config] normalized plugin config.
 * @returns {string} the system-prompt section, or an empty string when off.
 */
export function buildParallelPolicy(config) {
  if (config?.parallelEnabled !== true) return '';
  const write = fanout(config.parallelWriteFanout, 4, 8);
  const read = fanout(config.parallelReadFanout, 8, 12);
  return [
    '## 并行工作（可选策略）',
    '开始多步骤编码/实现任务前，先判断能否拆成互不阻塞的单元；能并行就不要串行。',
    '',
    '**何时并行**：独立文件/模块/包（写路径不重叠）；互不相关的失败测试或诊断方向；只读调研不同区域；不同验证层（typecheck/lint/unit/e2e）。',
    '',
    '**怎么拆**：',
    '1. 先列单元、允许写的路径、依赖关系；共享文件（lockfile、snapshot、生成文件、迁移）只能有一个写者。',
    '2. 1–2 个独立单元：在同一步里发多个 `subagent` 调用（会并发执行），不要串行发。',
    '3. 3 个以上：用 `workflow` 的 `parallel()` / `pipeline()`；每个 child 的 prompt 写清目标、允许修改的文件、验证命令，并返回 JSON（改了哪些文件/测试结果/风险）。',
    '4. 有依赖的用顺序阶段；不要让 B 等 A 的结果却并行启动。',
    `5. 扇出上限：写任务 ${write} 个，只读任务 ${read} 个；每个 child 都有 token 与上下文成本。`,
    '6. 父代理负责集成：等所有 child 结束，检查 diff 与冲突，跑合并后的验证（优先 affected 测试），确认后才汇报完成。长全量测试用 `run_in_background`，最后 `job_output`。',
    '7. 如果你是被委派的子代理：只完成分配给你的单元，不再拆分子任务、不再并行委派。',
    '',
    '**何时不要**：改动集中在一两个文件或同文件耦合；共享状态（数据库、迁移、锁、快照、端口、缓存）没有隔离；设计还没定；小任务（拆分开销大于收益）。',
    '',
    '**不要**：用 `subagent`/`workflow` 来跑测试（测试用一条 affected/`--changed` 命令）；未检查子代理结果、未跑验证就宣称完成。',
  ].join('\n');
}
