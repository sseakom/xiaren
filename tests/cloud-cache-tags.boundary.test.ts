import assert from 'assert';
import { test, vi } from 'vitest';

// 对抗/边界用例（QA 补充）：未知函数名、已知函数未知 action 的兜底行为
// （不应崩溃，仅产生 fn 标签；未知 action 不应生成读/写缓存标签）。

const OPENID = 'openid-adv';
vi.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: (k: string) => (k === 'user_openid_cache' ? OPENID : ''),
    setStorageSync: () => {},
    removeStorageSync: () => {},
    cloud: { init: () => {} },
  },
}));

import { buildCacheTags, buildInvalidationTags } from '../miniprogram/services/cloud';

test('buildCacheTags: 未知函数名优雅兜底（仅 fn 标签，不崩溃）', () => {
  assert.deepEqual(buildCacheTags('totallyUnknownFn', {}, {}, false), [
    'fn:totallyUnknownFn',
  ]);
  assert.deepEqual(buildCacheTags('totallyUnknownFn', {}, {}, true), [
    'fn:totallyUnknownFn',
  ]);
});

test('buildCacheTags: rating 始终携带 user:ratings 作用域标签（与具体 action 无关）', () => {
  // rating 的读缓存标签统一以 user:ratings 作用域承载，与具体 action 无关；
  // 实际只有 get/listMy 走 read 策略（见 getCloudRequestPolicy），其余 action 为 write 模式、
  // 不会进入 buildCacheTags；submit 再由 buildInvalidationTags 以 user:ratings 统一失效。
  assert.deepEqual(buildCacheTags('rating', { action: 'weirdAction' }, {}, false), [
    'fn:rating',
    'user:ratings',
  ]);
});

test('buildInvalidationTags: 未知函数名优雅兜底', () => {
  assert.deepEqual(buildInvalidationTags('totallyUnknownFn', {}, {}), [
    'fn:totallyUnknownFn',
  ]);
});

test('buildInvalidationTags: rating 非 submit action 不生成失效标签', () => {
  // rating 仅 submit 走写失效；get 不应产生任何失效标签
  assert.deepEqual(
    buildInvalidationTags('rating', { action: 'get', animation_bvid: 'BVx' }, {}),
    ['fn:rating'],
  );
});
