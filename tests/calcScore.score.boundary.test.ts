import assert from 'assert';
import { test } from 'vitest';
import { computeBayesianScore } from '../cloudfunctions/calcScore/score';

// 对抗/边界用例（QA 补充）：重点核验 WR 公式在 v 恰好等于 m 时的中点行为、
// distribution key 的 toFixed(1) 格式化、以及高 v 时 WR 严格向 R 收敛。

test('v === m 时 WR 为 (R + C) / 2 的精确中点', () => {
  // groups 的 count 总和恰好等于 m = 10
  const r = computeBayesianScore(
    [
      { _id: 5, count: 5 },
      { _id: 9, count: 5 },
    ],
    { m: 10, C: 3.5 },
  );
  // R = (5*5 + 9*5) / 10 = 7
  assert.equal(r.v, 10);
  assert.equal(r.R, 7);
  // WR = (10/20)*7 + (10/20)*3.5 = 3.5 + 1.75 = 5.25
  assert.ok(Math.abs(r.WR - 5.25) < 1e-9, `WR=${r.WR}`);
  // 恰好为 R 与 C 的中点
  assert.ok(Math.abs(r.WR - (r.R + r.C) / 2) < 1e-9);
});

test('distribution key 使用 toFixed(1)（浮点 _id 格式化）', () => {
  const r = computeBayesianScore(
    [
      { _id: 7.5, count: 2 },
      { _id: 8, count: 1 },
    ],
    { m: 10, C: 3.5 },
  );
  assert.equal(r.distribution['7.5'], 2);
  assert.equal(r.distribution['8.0'], 1);
});

test('v 极大时 WR 严格小于 R 且无限接近 R', () => {
  const groups = [];
  for (let i = 0; i < 5000; i += 1) groups.push({ _id: 9, count: 1 });
  const r = computeBayesianScore(groups, { m: 10, C: 3.5 });
  assert.equal(r.v, 5000);
  assert.equal(r.R, 9);
  // 收敛值 = (5000/5010)*9 + (10/5010)*3.5 ≈ 8.989
  assert.ok(r.WR < r.R, `WR=${r.WR} 应 < R=${r.R}`);
  assert.ok(Math.abs(r.WR - 8.989) < 0.01, `WR=${r.WR}`);
});
