// cloudfunctions/collection/index.js
// 收藏 / 看过 业务统一入口。
// 入参：{ action, ...payload }
//   - action: 'getStatus'   payload: { animation_id }
//       返回：{ success, isCollected, isWatched }
//   - action: 'toggle'      payload: { animation_id, type: 'collect'|'watched', add: boolean }
//       返回：{ success, isCollected, isWatched }（最新状态）
//   - action: 'listMy'      payload: { type: 'collect'|'watched', limit? }
//       返回：{ success, data: Collection[] }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ensureType(t) {
  return t === 'collect' || t === 'watched' ? t : null;
}

async function getStatus(animationId) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '未登录' };
  if (!animationId) return { success: false, error: '缺少 animation_id' };
  try {
    const res = await db
      .collection('collections')
      .where({ user_id: openid, animation_id: String(animationId) })
      .limit(10)
      .get();
    let isCollected = false;
    let isWatched = false;
    (res.data || []).forEach((c) => {
      if (c.type === 'collect') isCollected = true;
      if (c.type === 'watched') isWatched = true;
    });
    return { success: true, isCollected, isWatched };
  } catch (err) {
    console.error('[collection.getStatus] 失败', err);
    return { success: false, error: err.message };
  }
}

async function toggle(animationId, type, add) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '未登录' };
  const t = ensureType(type);
  if (!animationId || !t) {
    return { success: false, error: '参数错误' };
  }
  try {
    const res = await db
      .collection('collections')
      .where({ user_id: openid, animation_id: String(animationId), type: t })
      .limit(1)
      .get();
    if (add) {
      if (!res.data || res.data.length === 0) {
        await db.collection('collections').add({
          data: {
            user_id: openid,
            animation_id: String(animationId),
            type: t,
            created_at: new Date(),
          },
        });
      }
    } else if (res.data && res.data.length > 0) {
      const docId = String(res.data[0]._id);
      await db.collection('collections').doc(docId).remove();
    }
    return getStatus(animationId);
  } catch (err) {
    console.error('[collection.toggle] 失败', err);
    return { success: false, error: err.message };
  }
}

async function listMy(type, limit) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '未登录' };
  const t = ensureType(type);
  if (!t) return { success: false, error: 'type 非法' };
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  try {
    const res = await db
      .collection('collections')
      .where({ user_id: openid, type: t })
      .orderBy('created_at', 'desc')
      .limit(lim)
      .get();
    return { success: true, data: res.data || [] };
  } catch (err) {
    console.error('[collection.listMy] 失败', err);
    return { success: false, error: err.message };
  }
}

exports.main = async (event /*, context*/) => {
  const action = event && event.action;
  switch (action) {
    case 'getStatus':
      return getStatus(event.animation_id);
    case 'toggle':
      return toggle(event.animation_id, event.type, !!event.add);
    case 'listMy':
      return listMy(event.type, event.limit);
    default:
      return { success: false, error: `未知 action: ${action}` };
  }
};
