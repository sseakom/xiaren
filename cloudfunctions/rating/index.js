// cloudfunctions/rating/index.js
// 评分相关操作统一入口。
// 入参：{ action, ...payload }
//   - action: 'get'         payload: { animation_bvid }       → { success, score }
//   - action: 'submit'      payload: { animation_bvid, score } → { success, newRating }
//       评分落库后异步触发 calcScore 更新贝叶斯聚合
//   - action: 'listMy'      payload: { limit?, offset?, include_anim? }
//       include_anim 字段仅保留兼容；动画基础信息改由前端本地快照补齐
//       返回：{ success, data: Rating[], total }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 解析分页参数：limit 限制 1~100，offset >= 0 */
function parsePagination(limit, offset) {
  return {
    limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
    offset: Math.max(Number(offset) || 0, 0),
  };
}

/** 获取当前调用方 openid */
function getOpenid() {
  return cloud.getWXContext().OPENID || null;
}

async function findExistingRating(openid, animationBvid) {
  const res = await db
    .collection('ratings')
    .where({ user_id: openid, animation_bvid: String(animationBvid) })
    .limit(1)
    .get();
  return res.data && res.data.length > 0 ? res.data[0] : null;
}

async function get(animationBvid) {
  const openid = getOpenid();
  if (!openid) return { success: false, error: '未登录' };
  if (!animationBvid) return { success: false, error: '缺少 animation_bvid' };
  try {
    const existing = await findExistingRating(openid, animationBvid);
    const score = existing ? existing.score : 0;
    return { success: true, score };
  } catch (err) {
    console.error('[rating.get] 失败', err);
    return { success: false, error: err.message };
  }
}

async function submit(animationBvid, score) {
  const openid = getOpenid();
  if (!openid) return { success: false, error: '未登录' };
  if (!animationBvid) return { success: false, error: '缺少 animation_bvid' };
  const n = Number(score);
  if (!isFinite(n) || n <= 0) {
    return { success: false, error: 'score 非法' };
  }
  try {
    const existing = await findExistingRating(openid, animationBvid);
    const now = new Date();
    let newRating = false;
    if (existing) {
      const docId = String(existing._id);
      await db.collection('ratings').doc(docId).update({
        data: {
          score: n,
          updated_at: now,
          animation_bvid: String(animationBvid),
        },
      });
    } else {
      await db.collection('ratings').add({
        data: {
          user_id: openid,
          animation_bvid: String(animationBvid),
          score: n,
          created_at: now,
          updated_at: now,
        },
      });
      newRating = true;
    }
    // 异步触发评分聚合；不 await，避免阻塞返回
    cloud
      .callFunction({ name: 'calcScore', data: { animation_bvid: String(animationBvid) } })
      .catch((err) => console.error('[rating.submit] calcScore failed', err));
    return { success: true, newRating };
  } catch (err) {
    console.error('[rating.submit] 失败', err);
    return { success: false, error: err.message };
  }
}

async function listMy(limit, offset, includeAnim) {
  const openid = getOpenid();
  if (!openid) return { success: false, error: '未登录' };
  void includeAnim;
  const { limit: lim, offset: off } = parsePagination(limit, offset);
  try {
    // 1) count 总数
    const cnt = await db.collection('ratings').where({ user_id: openid }).count();
    const total = cnt.total || 0;
    // 2) 分页取 ratings
    const res = await db
      .collection('ratings')
      .where({ user_id: openid })
      .orderBy('updated_at', 'desc')
      .skip(off)
      .limit(lim)
      .get();
    const data = res.data || [];
    // include_anim 保留兼容字段，但动画摘要改由前端本地快照补齐
    return { success: true, data, total };
  } catch (err) {
    console.error('[rating.listMy] 失败', err);
    return { success: false, error: err.message };
  }
}

exports.main = async (event /*, context*/) => {
  const action = event && event.action;
  switch (action) {
    case 'get':
      return get(event.animation_bvid);
    case 'submit':
      return submit(event.animation_bvid, event.score);
    case 'listMy':
      return listMy(event.limit, event.offset, !!event.include_anim);
    default:
      return { success: false, error: `未知 action: ${action}` };
  }
};
