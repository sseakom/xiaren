import assert from 'assert';
import { test, vi } from 'vitest';

// cloud.ts 缓存标签单测
// 通过 vi.mock('@tarojs/taro') 固定 getStorageSync 锁定 scope，断言各云函数 case 的 tag 生成
// 与 userScoped 行为。

const OPENID = 'openid-abc';
const SCOPE = `user:${OPENID}`;

vi.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: (key: string) => (key === 'user_openid_cache' ? OPENID : ''),
    setStorageSync: () => {},
    removeStorageSync: () => {},
    cloud: { init: () => {} },
  },
}));

import { buildCacheTags, buildInvalidationTags } from '../miniprogram/services/cloud';

// ---- buildCacheTags ----

function testListAnimations() {
  const tags = buildCacheTags(
    'listAnimations',
    { action: 'snapshot' },
    { data: [{ bvid: 'BV1' }, { bvid: 'BV2' }] },
    false,
  );
  assert.deepEqual(tags, ['fn:listAnimations', 'animations:list', 'animation:BV1', 'animation:BV2']);
}

function testCalcScore() {
  const tags = buildCacheTags('calcScore', { animation_bvid: 'BVx' }, {}, false);
  assert.deepEqual(tags, ['fn:calcScore', 'animation:BVx:score', 'animation:BVx']);
}

function testRatingGetUserScoped() {
  const tags = buildCacheTags('rating', { action: 'get', animation_bvid: 'BVr' }, {}, true);
  assert.deepEqual(tags, [
    'fn:rating',
    `user:ratings@${SCOPE}`,
    `animation:BVr:rating@${SCOPE}`,
    'animation:BVr',
  ]);
}

function testCollectionListMyUserScoped() {
  const tags = buildCacheTags(
    'collection',
    { action: 'listMy', type: 'collect' },
    { data: [{ bvid: 'BVc' }] },
    true,
  );
  assert.deepEqual(tags, [
    'fn:collection',
    `user:collections@${SCOPE}`,
    `user:collections:collect@${SCOPE}`,
    'animation:BVc',
  ]);
}

function testUserServiceGetInfoUserScoped() {
  const tags = buildCacheTags('userService', { action: 'getInfo' }, {}, true);
  assert.deepEqual(tags, ['fn:userService', `user:profile@${SCOPE}`]);
}

function testAnimationSubmitCheckBvidUnique() {
  const tags = buildCacheTags('animationSubmit', { action: 'checkBvidUnique', bvid: 'BVs' }, {}, false);
  assert.deepEqual(tags, ['fn:animationSubmit', 'submission:bvid', 'submission:bvid:bvs']);
}

function testAnimationReviewList() {
  const tags = buildCacheTags(
    'animationReview',
    { action: 'list' },
    { data: [{ _id: 'r1' }, { _id: 'r2' }] },
    false,
  );
  assert.deepEqual(tags, ['fn:animationReview', 'review:list', 'review:item:r1', 'review:item:r2']);
}

function testAnimationReviewGet() {
  const tags = buildCacheTags('animationReview', { action: 'get', _id: 'r9' }, {}, false);
  assert.deepEqual(tags, ['fn:animationReview', 'review:item:r9']);
}

// ---- buildInvalidationTags ----

function testRatingSubmitUserScoped() {
  const tags = buildInvalidationTags('rating', { action: 'submit', animation_bvid: 'BVr' }, {});
  assert.deepEqual(tags, [
    'fn:rating',
    `user:ratings@${SCOPE}`,
    `user:stats@${SCOPE}`,
    `animation:BVr:rating@${SCOPE}`,
    'animation:BVr:score',
  ]);
}

function testCollectionToggleUserScoped() {
  const tags = buildInvalidationTags(
    'collection',
    { action: 'toggle', animation_bvid: 'BVc', type: 'collect' },
    {},
  );
  assert.deepEqual(tags, [
    'fn:collection',
    `user:collections@${SCOPE}`,
    `user:stats@${SCOPE}`,
    `user:collections:collect@${SCOPE}`,
    `animation:BVc:collection@${SCOPE}`,
  ]);
}

function testUserServiceUpsertUserScoped() {
  const tags = buildInvalidationTags('userService', { action: 'upsert' }, {});
  assert.deepEqual(tags, ['fn:userService', `user:profile@${SCOPE}`, `user:stats@${SCOPE}`]);
}

function testAnimationSubmitCreateUserScoped() {
  const tags = buildInvalidationTags('animationSubmit', { type: 'create', payload: { bvid: 'BVs' } }, {});
  assert.deepEqual(tags, [
    'fn:animationSubmit',
    `user:submissions@${SCOPE}`,
    'review:list',
    `submission:bvid@${SCOPE}`,
    'submission:bvid:bvs',
  ]);
}

function testAnimationReviewApproveCreate() {
  const tags = buildInvalidationTags(
    'animationReview',
    { action: 'approve', _id: 'r1' },
    { data: { submissionId: 'r1', type: 'create', bvid: 'BVn' } },
  );
  assert.deepEqual(tags, [
    'fn:animationReview',
    'review:list',
    'review:item:r1',
    'animations:list',
    'submission:bvid:bvn',
  ]);
}

function run() {
  testListAnimations();
  testCalcScore();
  testRatingGetUserScoped();
  testCollectionListMyUserScoped();
  testUserServiceGetInfoUserScoped();
  testAnimationSubmitCheckBvidUnique();
  testAnimationReviewList();
  testAnimationReviewGet();
  testRatingSubmitUserScoped();
  testCollectionToggleUserScoped();
  testUserServiceUpsertUserScoped();
  testAnimationSubmitCreateUserScoped();
  testAnimationReviewApproveCreate();
  console.log('cloud cache tags tests passed');
}

test('cloud cache tags', () => run());
