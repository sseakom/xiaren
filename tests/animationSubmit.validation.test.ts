import assert from 'assert';
import { test } from 'vitest';
import {
  BV_REGEX,
  validateCreatePayload,
  validateCorrectionPayload,
  validateDeletePayload,
} from '../cloudfunctions/animationSubmit/validation';

// animationSubmit 校验单测（纯函数，无 wx-server-sdk 依赖）

function testBvRegex() {
  assert.ok(BV_REGEX.test('BV1abcd1234')); // BV1 + 8 位
  assert.ok(!BV_REGEX.test('BV1abc')); // 太短
  assert.ok(!BV_REGEX.test('BV2abcd1234')); // 非 BV1 开头
  assert.ok(!BV_REGEX.test('bv1abcd1234')); // 小写
}

function testValidateCreatePayload() {
  assert.equal(validateCreatePayload(null), '表单为空');
  assert.equal(validateCreatePayload({}), '缺少必填字段：title');

  const ok = {
    title: 't',
    bvid: 'BV1abcd1234',
    up_name: 'u',
    cover: 'c',
    duration: 120,
    publish_time: '2023',
    tag: 'x',
  };
  assert.equal(validateCreatePayload(ok), null);

  assert.equal(validateCreatePayload({ ...ok, title: '' }), '缺少必填字段：title');
  assert.equal(validateCreatePayload({ ...ok, duration: 0 }), 'duration 必须为正数（秒）');
  assert.equal(validateCreatePayload({ ...ok, duration: -5 }), 'duration 必须为正数（秒）');
  assert.equal(validateCreatePayload({ ...ok, bvid: 'bad' }), 'bvid 格式不正确（应为 BV 开头 10+ 位的 B 站视频 ID）');
}

function testValidateCorrectionPayload() {
  assert.equal(validateCorrectionPayload(null), '表单为空');
  assert.equal(validateCorrectionPayload({ title: '', tag: 'x' }), '标题不能为空');
  assert.equal(validateCorrectionPayload({ title: 't', tag: '' }), '标签不能为空');
  assert.equal(validateCorrectionPayload({ title: 't', tag: 'x' }), null);
}

function testValidateDeletePayload() {
  assert.equal(validateDeletePayload(null), '请填写删除理由');
  assert.equal(validateDeletePayload({ reason: '' }), '请填写删除理由');
  assert.equal(validateDeletePayload({ reason: 'abc' }), '删除理由至少 4 个字');
  assert.equal(validateDeletePayload({ reason: 'abcd' }), null);
}

function run() {
  testBvRegex();
  testValidateCreatePayload();
  testValidateCorrectionPayload();
  testValidateDeletePayload();
  console.log('animationSubmit validation tests passed');
}

test('animationSubmit validation', () => run());
