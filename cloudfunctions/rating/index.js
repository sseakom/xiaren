// cloudfunctions/rating/index.js
// 评分相关操作统一入口。
// 入参：{ action, ...payload }
//   - action: 'get'         payload: { animation_id }
//       返回：{ success, score }
//   - action: 'submit'      payload: { animation_id, score }
//       写入/更新用户对动画的评分，返回：{ success, newRating }
//       评分落库后异步触发 calcScore 更新贝叶斯聚合
//   - action: 'listMy'      payload: { limit? }
//       返回：{ success, data: Rating[] }
// 出参统一 { success, error?, ... }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function get(animationId) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '未登录' };
  if (!animationId) return { success: false, error: '缺少 animation_id' };
  try {
    const res = await db
      .collection('ratings')
      .where({ user_id: openid, animation_id: String(animationId) })
      .limit(1)
      .get();
    const score = res.data && res.data.length > 0 ? res.data[0].score : 0;
    return { success: true, score };
  } catch (err) {
    console.error('[rating.get] 失败', err);
    return { success: false, error: err.message };
  }
}

async function submit(animationId, score) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '未登录' };
  if (!animationId) return { success: false, error: '缺少 animation_id' };
  const n = Number(score);
  if (!isFinite(n) || n <= 0) {
    return { success: false, error: 'score 非法' };
  }
  try {
    const exist = await db
      .collection('ratings')
      .where({ user_id: openid, animation_id: String(animationId) })
      .limit(1)
      .get();
    const now = new Date();
    let newRating = false;
    if (exist.data && exist.data.length > 0) {
      const docId = String(exist.data[0]._id);
      await db.collection('ratings').doc(docId).update({
        data: { score: n, updated_at: now },
      });
    } else {
      await db.collection('ratings').add({
        data: {
          user_id: openid,
          animation_id: String(animationId),
          score: n,
          created_at: now,
          updated_at: now,
        },
      });
      newRating = true;
    }
    // 异步触发评分聚合；不再 await，避免阻塞返回
    cloud
      .callFunction({ name: 'calcScore', data: { animation_id: String(animationId) } })
      .catch((err) => console.error('[rating.submit] calcScore failed', err));
    return { success: true, newRating };
  } catch (err) {
    console.error('[rating.submit] 失败', err);
    return { success: false, error: err.message };
  }
}

async function listMy(limit) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '未登录' };
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  try {
    const res = await db
      .collection('ratings')
      .where({ user_id: openid })
      .orderBy('updated_at', 'desc')
      .limit(lim)
      .get();
    return { success: true, data: res.data || [] };
  } catch (err) {
    console.error('[rating.listMy] 失败', err);
    return { success: false, error: err.message };
  }
}

exports.main = async (event /*, context*/) => {
  const action = event && event.action;
  switch (action) {
    case 'get':
      return get(event.animation_id);
    case 'submit':
      return submit(event.animation_id, event.score);
    case 'listMy':
      return listMy(event.limit);
    default:
      return { success: false, error: `未知 action: ${action}` };
  }
};
