/**
 * The parallel-work policy is pure text: assert the switch, the caps, and the
 * execution guidance the model needs to see (and nothing that would let the
 * policy itself run tools).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildParallelPolicy } from '../src/parallel.js';

test('the policy is empty while the switch is off', () => {
  assert.equal(buildParallelPolicy({ parallelEnabled: false }), '');
  assert.equal(buildParallelPolicy({}), '');
  assert.equal(buildParallelPolicy(undefined), '');
});

test('the policy names subagent/workflow, writes scopes and the integration step', () => {
  const text = buildParallelPolicy({
    parallelEnabled: true,
    parallelWriteFanout: 3,
    parallelReadFanout: 6,
  });
  assert.match(text, /`subagent`/);
  assert.match(text, /`workflow`/);
  assert.match(text, /写任务 3 个/);
  assert.match(text, /只读任务 6 个/);
  assert.match(text, /共享文件/);
  assert.match(text, /父代理负责集成/);
  assert.match(text, /用 `subagent`\/`workflow` 来跑测试/);
});

test('fan-out values are clamped to the range the UI advertises', () => {
  const text = buildParallelPolicy({
    parallelEnabled: true,
    parallelWriteFanout: 99,
    parallelReadFanout: 0,
  });
  assert.match(text, /写任务 8 个/);
  assert.match(text, /只读任务 1 个/);
});
