import assert from 'assert';
import { test } from 'vitest';
import {
  BV_REGEX,
  validateCreatePayload,
  validateCorrectionPayload,
  validateDeletePayload,
} from '../cloudfunctions/animationSubmit/validation';

// 对抗/边界用例（QA 补充）：BV 正则最小长度边界、create 对 duration 的类型严格性、
// 缺失字段按必填顺序返回首个、correction/delete 的边界长度。

test('BV 正则最小长度边界：BV1 + 8 位合法，7 位非法', () => {
  assert.ok(BV_REGEX.test('BV1abcdefgh')); // BV1 + 8 位
  assert.ok(!BV_REGEX.test('BV1abcdefg')); // 仅 7 位 → 非法
});

test('create: duration 为字符串 "120" 应因类型不符被拒绝', () => {
  const ok = {
    title: 't',
    bvid: 'BV1abcdefgh',
    up_name: 'u',
    cover: 'c',
    duration: 120,
    publish_time: '2023',
    tag: 'x',
  };
  // 正确数字类型通过
  assert.equal(validateCreatePayload(ok), null);
  // 字符串数字应被拒绝（typeof !== 'number'）
  assert.equal(
    validateCreatePayload({ ...ok, duration: '120' }),
    'duration 必须为正数（秒）',
  );
});

test('create: 返回首个缺失字段名（按必填顺序）', () => {
  const base = {
    title: 't',
    bvid: 'BV1abcdefgh',
    up_name: 'u',
    cover: 'c',
    duration: 120,
    publish_time: '2023',
    tag: 'x',
  };
  assert.equal(validateCreatePayload({ ...base, tag: '' }), '缺少必填字段：tag');
  assert.equal(validateCreatePayload({ ...base, cover: null }), '缺少必填字段：cover');
});

test('correction: 仅空白标题/标签应判为空', () => {
  assert.equal(validateCorrectionPayload({ title: '   ', tag: 'x' }), '标题不能为空');
  assert.equal(validateCorrectionPayload({ title: 't', tag: '   ' }), '标签不能为空');
});

test('delete: reason 边界长度 4 字通过，3 字拒绝', () => {
  assert.equal(validateDeletePayload({ reason: 'abcd' }), null);
  assert.equal(validateDeletePayload({ reason: 'abc' }), '删除理由至少 4 个字');
});
