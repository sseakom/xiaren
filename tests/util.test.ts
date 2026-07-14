import assert from 'assert';
import { test, vi } from 'vitest';

// util.ts 顶部 import '@tarojs/taro'，node 环境无该全局，需 mock 以固定 import 不报错
vi.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: () => '',
    setStorageSync: () => {},
    removeStorageSync: () => {},
    cloud: { init: () => {} },
  },
}));

import {
  formatNumber,
  formatTime,
  formatDuration,
  formatDateTime,
  parseTags,
} from '@/utils/util';

function testFormatNumber() {
  // 非法 / 负数 / 空
  assert.equal(formatNumber(null), '0');
  assert.equal(formatNumber(undefined), '0');
  assert.equal(formatNumber('abc'), '0');
  assert.equal(formatNumber(-5), '0');

  // < 1000 → 原值（向下取整）
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(999.9), '999');

  // 1000 ~ 10000 → k
  assert.equal(formatNumber(1000), '1k');
  assert.equal(formatNumber(1500), '1.5k');

  // 10000 ~ 1亿 → w
  assert.equal(formatNumber(10000), '1w');
  assert.equal(formatNumber(12345), '1.2w');

  // >= 1亿 → 亿
  assert.equal(formatNumber(200000000), '2亿');
}

function testFormatDuration() {
  // 非法 / 空
  assert.equal(formatDuration(null), '--:--');
  assert.equal(formatDuration(undefined), '--:--');
  assert.equal(formatDuration('abc'), '--:--');
  assert.equal(formatDuration(-5), '--:--');

  // 数字（秒）
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(125), '02:05');
  assert.equal(formatDuration(3725), '1:02:05');

  // 字符串：纯数字当秒
  assert.equal(formatDuration('125'), '02:05');

  // 字符串：mm:ss
  assert.equal(formatDuration('27:50:39') === '27:50:39' || formatDuration('1670:39') === '27:50:39', true);
  // 1670:39 → 1670*60+39 = 100239s → 27:50:39
  assert.equal(formatDuration('1670:39'), '27:50:39');
  // 01:23:45 → 1:23:45
  assert.equal(formatDuration('1:23:45'), '1:23:45');
}

function testFormatTime() {
  assert.equal(formatTime(''), '');
  assert.equal(formatTime(null), '');
  assert.equal(formatTime(undefined), '');

  const now = Date.now();
  assert.equal(formatTime(new Date(now - 30 * 1000)), '刚刚');
  assert.equal(formatTime(new Date(now - 3 * 60 * 1000)), '3分钟前');
  assert.equal(formatTime(new Date(now - 2 * 60 * 60 * 1000)), '2小时前');
  assert.equal(formatTime(new Date(now - 3 * 24 * 60 * 60 * 1000)), '3天前');
  assert.equal(formatTime(new Date(now - 40 * 24 * 60 * 60 * 1000)), '1个月前');
}

function testFormatDateTime() {
  assert.equal(formatDateTime(null), '');
  assert.equal(formatDateTime(undefined), '');
  assert.equal(formatDateTime('invalid'), '');

  // 用 Date 构造避免时区歧义
  const d = new Date(2023, 0, 5, 8, 30); // 2023-01-05 08:30 本地
  assert.equal(formatDateTime(d), '2023-01-05 08:30');
  assert.equal(formatDateTime('2023-01-05T08:30:00'), '2023-01-05 08:30');
}

function testParseTags() {
  // 数组
  assert.deepEqual(parseTags(['a', ' b ', '']), ['a', 'b']);
  // 中英文逗号 / 分号 / 空白
  assert.deepEqual(parseTags('沙雕,修仙'), ['沙雕', '修仙']);
  assert.deepEqual(parseTags('a，b；c d'), ['a', 'b', 'c', 'd']);
  // 空
  assert.deepEqual(parseTags(''), []);
  assert.deepEqual(parseTags(undefined), []);
  assert.deepEqual(parseTags('   '), []);
}

function run() {
  testFormatNumber();
  testFormatDuration();
  testFormatTime();
  testFormatDateTime();
  testParseTags();
  console.log('util tests passed');
}

test('util', () => run());
