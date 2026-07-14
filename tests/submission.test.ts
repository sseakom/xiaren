import assert from 'assert';
import { test } from 'vitest';
import { getSubmissionDisplay, SUBMISSION_TYPE_LABEL } from '@/utils/submission';

// submission.ts 单测：getSubmissionDisplay 在 create / correction / correction_delete 三态
// 正确提取展示字段，并对空 payload / target 兜底。
function testCreate() {
  const it: any = {
    _id: 's1',
    type: 'create',
    payload: {
      title: '沙雕动画A',
      bvid: 'BV1abcd1234',
      up_name: 'upA',
      cover: 'cA',
      duration: 125,
      play_count: 100,
      like_count: 5,
      tag: '沙雕',
      url: 'https://x.com/a',
      publish_time: '2023',
    },
    target: {},
  };
  const d = getSubmissionDisplay(it);
  assert.equal(d.title, '沙雕动画A');
  assert.equal(d.bvid, 'BV1abcd1234');
  assert.equal(d.upName, 'upA');
  assert.equal(d.cover, 'cA');
  assert.equal(d.duration, 125);
  assert.equal(d.playCount, 100);
  assert.equal(d.likeCount, 5);
  assert.equal(d.tag, '沙雕');
  assert.equal(d.url, 'https://x.com/a');
  assert.equal(d.publishTime, '2023');
}

function testCreateFallback() {
  const d = getSubmissionDisplay({ _id: 'x', type: 'create', payload: {}, target: {} } as any);
  assert.equal(d.title, '未命名');
  assert.equal(d.bvid, undefined);
  assert.equal(d.duration, 0);
  assert.equal(d.url, '');
}

function testCorrection() {
  const it: any = {
    _id: 's2',
    type: 'correction',
    payload: { title: '修正标题', tag: '修仙' },
    target: { title: '原标题', bvid: 'BV1old12345', up_name: 'upB', cover: 'cB', duration: 60 },
  };
  const d = getSubmissionDisplay(it);
  assert.equal(d.title, '修正标题'); // payload.title 优先
  assert.equal(d.bvid, 'BV1old12345');
  assert.equal(d.upName, 'upB');
  assert.equal(d.cover, 'cB');
  assert.equal(d.duration, 60);
  assert.equal(d.tag, '修仙'); // correction 取 payload.tag
  assert.equal(d.url, 'https://www.bilibili.com/video/BV1old12345');
  assert.equal(d.publishTime, undefined);
}

function testCorrectionFallbackTitle() {
  // payload 无 title 时回退 target.title，再回退 '勘误'
  const d1 = getSubmissionDisplay({ _id: 'x', type: 'correction', payload: {}, target: { title: 'T' } } as any);
  assert.equal(d1.title, 'T');
  const d2 = getSubmissionDisplay({ _id: 'x', type: 'correction', payload: {}, target: {} } as any);
  assert.equal(d2.title, '勘误');
}

function testCorrectionDelete() {
  const it: any = {
    _id: 's3',
    type: 'correction_delete',
    payload: { reason: '重复' },
    target: { title: '待删', bvid: 'BV1del12345', up_name: 'upC', cover: 'cC', duration: 30 },
  };
  const d = getSubmissionDisplay(it);
  assert.equal(d.title, '待删'); // correction_delete 取 target.title
  assert.equal(d.bvid, 'BV1del12345');
  assert.equal(d.duration, 30);
  assert.equal(d.tag, undefined); // correction_delete 不取 tag
  assert.equal(d.url, 'https://www.bilibili.com/video/BV1del12345');
}

function testCorrectionDeleteFallbackTitle() {
  const d = getSubmissionDisplay({ _id: 'x', type: 'correction_delete', payload: {}, target: {} } as any);
  assert.equal(d.title, '申请删除');
}

function testLabels() {
  assert.equal(SUBMISSION_TYPE_LABEL.create, '录入');
  assert.equal(SUBMISSION_TYPE_LABEL.correction, '勘误');
  assert.equal(SUBMISSION_TYPE_LABEL.correction_delete, '申请删除');
}

function run() {
  testCreate();
  testCreateFallback();
  testCorrection();
  testCorrectionFallbackTitle();
  testCorrectionDelete();
  testCorrectionDeleteFallbackTitle();
  testLabels();
  console.log('submission tests passed');
}

test('submission', () => run());
