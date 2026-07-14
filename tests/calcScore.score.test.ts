import assert from 'assert';
import { test } from 'vitest';
import { computeBayesianScore } from '../cloudfunctions/calcScore/score';

// calcScore 贝叶斯计算单测（纯函数，无 wx-server-sdk 依赖）

function testEmptyGroups() {
  const r = computeBayesianScore([], { m: 10, C: 3.5 });
  assert.equal(r.WR, 0);
  assert.equal(r.v, 0);
  assert.equal(r.R, 0);
  assert.equal(r.C, 3.5);
  assert.deepEqual(r.distribution, {});
}

function testSmallVConvergesToC() {
  // v 极小 → WR 向 C 收敛
  const r = computeBayesianScore([{ _id: 10, count: 1 }], { m: 10, C: 3.5 });
  assert.equal(r.v, 1);
  assert.equal(r.R, 10);
  // WR = (1/11)*10 + (10/11)*3.5 ≈ 4.09
  assert.ok(Math.abs(r.WR - 4.09) < 0.01, `WR=${r.WR}`);
  assert.equal(r.distribution['10.0'], 1);
}

function testLargeVConvergesToR() {
  // v 极大 → WR 向 R 收敛
  const groups = [];
  for (let i = 0; i < 1000; i += 1) groups.push({ _id: 8, count: 1 });
  const r = computeBayesianScore(groups, { m: 10, C: 3.5 });
  assert.equal(r.v, 1000);
  assert.equal(r.R, 8);
  // WR = (1000/1010)*8 + (10/1010)*3.5 ≈ 7.96
  assert.ok(Math.abs(r.WR - 7.96) < 0.02, `WR=${r.WR}`);
  assert.equal(r.distribution['8.0'], 1000);
}

function testDistributionAggregation() {
  const r = computeBayesianScore(
    [
      { _id: 5, count: 2 },
      { _id: 9, count: 3 },
    ],
    { m: 10, C: 3.5 },
  );
  assert.equal(r.v, 5);
  assert.equal(r.R, (5 * 2 + 9 * 3) / 5); // (10+27)/5 = 7.4
  assert.equal(r.distribution['5.0'], 2);
  assert.equal(r.distribution['9.0'], 3);
}

function testNonFiniteScoreSkipped() {
  const r = computeBayesianScore(
    [
      { _id: 'bad', count: 5 },
      { _id: 7, count: 1 },
    ],
    { m: 10, C: 3.5 },
  );
  assert.equal(r.v, 1);
  assert.equal(r.R, 7);
  assert.deepEqual(r.distribution, { '7.0': 1 });
}

function run() {
  testEmptyGroups();
  testSmallVConvergesToC();
  testLargeVConvergesToR();
  testDistributionAggregation();
  testNonFiniteScoreSkipped();
  console.log('calcScore score tests passed');
}

test('calcScore score', () => run());
