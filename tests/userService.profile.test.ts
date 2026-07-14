import assert from 'assert';
import { test } from 'vitest';
import { sanitizeProfileInput, normalizeUser } from '../cloudfunctions/userService/profile';

// userService 档案 sanitize / normalize 单测（纯函数，无 wx-server-sdk 依赖）

function testSanitizeFiltersDangerousFields() {
  const s = sanitizeProfileInput({
    nickName: 'n',
    avatarUrl: 'a',
    phoneNumber: 'p',
    is_admin: true,
    foo: 'bar',
  });
  assert.deepEqual(s, { nickName: 'n', avatarUrl: 'a', phoneNumber: 'p' });
  assert.ok(!('is_admin' in s));
  assert.ok(!('foo' in s));
}

function testNormalizeIgnoresMaliciousIsAdmin() {
  const u = normalizeUser('openid1', { nickName: 'hack', is_admin: true, avatarUrl: 'x' });
  assert.equal(u._id, 'openid1');
  assert.equal(u.nickName, 'hack');
  assert.equal(u.avatarUrl, 'x');
  assert.equal(u.is_admin, false); // 来自 existing（无 existing → false）
  assert.ok(u.created_at != null);
  assert.ok(u.updated_at != null);
}

function testNormalizeKeepsExistingIsAdmin() {
  const existing = {
    nickName: 'old',
    avatarUrl: 'oldA',
    phoneNumber: 'oldP',
    is_admin: true,
    created_at: '2020',
  };
  const u = normalizeUser('openid2', { nickName: 'new' }, existing);
  assert.equal(u.is_admin, true); // 来自 existing，profile 无法覆盖
  assert.equal(u.nickName, 'new'); // profile 覆盖
  assert.equal(u.avatarUrl, 'oldA'); // profile 未提供 → existing
  assert.equal(u.phoneNumber, 'oldP');
  assert.equal(u.created_at, '2020');
}

function testNormalizeMissingFieldsFallback() {
  const u = normalizeUser('openid3', {}, {});
  assert.equal(u.nickName, '');
  assert.equal(u.avatarUrl, '');
  assert.equal(u.phoneNumber, '');
  assert.equal(u.is_admin, false);
}

function run() {
  testSanitizeFiltersDangerousFields();
  testNormalizeIgnoresMaliciousIsAdmin();
  testNormalizeKeepsExistingIsAdmin();
  testNormalizeMissingFieldsFallback();
  console.log('userService profile tests passed');
}

test('userService profile', () => run());
