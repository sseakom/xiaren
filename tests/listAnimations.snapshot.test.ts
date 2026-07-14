import assert from 'assert';
import { createRequire } from 'module';
import { test } from 'vitest';
// 云函数 listAnimations 在模块顶层 require('wx-server-sdk')（原生 require），
// 由 tests/setup.ts 的 Module._load hook 重定向到仓库内已提交的替身
// tests/__mocks__/wx-server-sdk.js。测试内同样用原生 require 取得同一模块实例，
// 以 setMockAnimations 注入假数据，保证数据经闭包传递给 db.collection().get()。
// 验证 snapshot 输出（字段裁剪、bvid 过滤、total=pageSize=data.length）与改造前一致；
// 非 snapshot action 一律报错（死代码已删，H-04）。
const require = createRequire(import.meta.url);
const { setMockAnimations } = require('wx-server-sdk') as {
  setMockAnimations: (list: any[]) => void;
};
import { main, buildSnapshotList } from '../cloudfunctions/listAnimations/index';

function testSnapshotRegression() {
  setMockAnimations([
    {
      bvid: 'BV1xx1234567',
      title: '沙雕动画A',
      up_name: 'upA',
      cover: 'cA',
      duration: 125,
      play_count: 100,
      danmaku_count: 10,
      like_count: 5,
      publish_time: '2023-01-01',
      tag: '沙雕,搞笑',
      score: 8.5,
    },
    {
      bvid: 'BV1yy7654321',
      title: '沙雕动画B',
      up_name: 'upB',
      duration: '1:23', // → 83s
      play_count: '200',
      tag: ['修仙', '爆笑'],
      score: '9',
    },
    {
      // 无 bvid → 应被过滤
      title: '无bvid',
      duration: 30,
    },
  ]);

  return main({ action: 'snapshot' }).then((res: any) => {
    assert.equal(res.success, true);
    assert.equal(res.page, 0);
    assert.equal(res.pageSize, 2);
    assert.equal(res.total, 2);
    assert.equal(res.data.length, 2);

    const a = res.data[0];
    assert.equal(a.bvid, 'BV1xx1234567');
    assert.equal(a.title, '沙雕动画A');
    assert.equal(a.up_name, 'upA');
    assert.equal(a.cover, 'cA');
    assert.equal(a.duration, 125);
    assert.equal(a.play_count, 100);
    assert.equal(a.tag, '沙雕,搞笑');
    assert.deepEqual(a.tags, ['沙雕', '搞笑']);
    assert.equal(a.score, 8.5);

    const b = res.data[1];
    assert.equal(b.bvid, 'BV1yy7654321');
    assert.equal(b.duration, 83); // '1:23' → 83
    assert.equal(b.play_count, 200);
    assert.deepEqual(b.tags, ['修仙', '爆笑']);
    assert.equal(b.score, 9);

    // 所有输出项都有 bvid
    assert.ok(!res.data.some((x: any) => !x.bvid));
  });
}

function testBuildSnapshotListFiltersNoBvid() {
  const list = buildSnapshotList([
    { bvid: 'BV1a', title: 'A', tag: 'x' },
    { title: 'no-bvid', tag: 'y' },
    { bvid: '', title: 'empty-bvid', tag: 'z' },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].bvid, 'BV1a');
}

function testNonSnapshotRejected() {
  return main({ action: 'list' }).then((res: any) => {
    assert.equal(res.success, false);
    assert.ok(/snapshot/.test(res.error));
  });
}

test('listAnimations snapshot regression', async () => {
  await testSnapshotRegression();
  testBuildSnapshotListFiltersNoBvid();
  await testNonSnapshotRejected();
});
