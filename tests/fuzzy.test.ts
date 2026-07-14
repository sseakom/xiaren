import assert from 'assert';
import { test } from 'vitest';
import { tokenize, fuzzyScore } from '@/utils/fuzzy';

// fuzzy.ts 单测：tokenize 分词 + fuzzyScore 五档评分（含边界）
function testTokenize() {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('Java'), ['java']);
  // 连续 ASCII 视为一个整体
  assert.deepEqual(tokenize('A1b'), ['a1b']);
  // 中文按字符切分
  assert.deepEqual(tokenize('沙雕'), ['沙', '雕']);
  // 混合：中文 + ASCII 连续词
  assert.deepEqual(tokenize('沙diao'), ['沙', 'diao']);
  // 纯符号单独成 token
  assert.deepEqual(tokenize('!!'), ['!', '!']);
}

function testFuzzyScore() {
  // 完全相等：1000
  assert.equal(fuzzyScore('沙雕', '沙雕'), 1000);
  assert.equal(fuzzyScore('SHADIAO', 'shadiao'), 1000);

  // 前缀匹配：500
  assert.equal(fuzzyScore('沙雕动画', '沙雕'), 500);
  assert.equal(fuzzyScore('abc', 'a'), 500);

  // 完整子串（非前缀）：200
  assert.equal(fuzzyScore('热门沙雕合集', '沙雕'), 200);

  // 字符按序出现（乱序不行）：100
  assert.equal(fuzzyScore('沙雕宇宙', '沙宇宙'), 100);

  // 字符全出现（任意顺序）：30
  assert.equal(fuzzyScore('宙宇沙', '沙宇宙'), 30);

  // 不匹配：0
  assert.equal(fuzzyScore('abc', 'xyz'), 0);

  // 空输入 / 空 keyword
  assert.equal(fuzzyScore('', 'x'), 0);
  assert.equal(fuzzyScore('abc', ''), 0);
  assert.equal(fuzzyScore('', ''), 0);

  // 纯符号无命中
  assert.equal(fuzzyScore('!!!', '@@@'), 0);
}

function run() {
  testTokenize();
  testFuzzyScore();
  console.log('fuzzy tests passed');
}

test('fuzzy', () => run());
