// cloudfunctions/userService/index.js
// 用户业务统一入口。
// 入参：{ action, ...payload }
//   - action: 'getInfo'
//       读用户档案；不存在则按 openid upsert 一条空档案后返回
//       返回：{ success, data: User }
//   - action: 'upsert'      payload: { profile: { nickName, avatarUrl } }
//       upsert 用户档案（doc(openid).set()），已存在不报错
//       返回：{ success, data: User }
//   - action: 'updateProfile' payload: { profile: { nickName, avatarUrl } }
//       局部更新用户档案
//       返回：{ success }
//   - action: 'loadStats'
//       返回用户的 ratingCount / collectCount
//       返回：{ success, ratingCount, collectCount }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ensureOpenid(openid) {
  if (!openid) return { success: false, error: '未登录' };
  return null;
}

async function getInfo() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const guard = ensureOpenid(openid);
  if (guard) return guard;
  try {
    const res = await db.collection('users').doc(openid).get();
    if (res.data) {
      return { success: true, data: res.data };
    }
    // 不存在 → upsert 一条空档案
    const now = new Date();
    const profile = { _id: openid, nickName: '', avatarUrl: '', created_at: now, updated_at: now };
    try {
      await db.collection('users').doc(openid).set({ data: profile });
    } catch (e) {
      // 兜底：set 失败不阻塞返回
      console.warn('[userService.getInfo] upsert fallback', e);
    }
    return { success: true, data: profile };
  } catch (err) {
    console.error('[userService.getInfo] 失败', err);
    return { success: false, error: err.message };
  }
}

async function upsert(profile) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const guard = ensureOpenid(openid);
  if (guard) return guard;
  const now = new Date();
  const data = {
    _id: openid,
    nickName: (profile && profile.nickName) || '',
    avatarUrl: (profile && profile.avatarUrl) || '',
    created_at: now,
    updated_at: now,
  };
  try {
    await db.collection('users').doc(openid).set({ data });
    return { success: true, data };
  } catch (err) {
    console.error('[userService.upsert] 失败', err);
    return { success: false, error: err.message };
  }
}

async function updateProfile(profile) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const guard = ensureOpenid(openid);
  if (guard) return guard;
  if (!profile || (profile.nickName == null && profile.avatarUrl == null)) {
    return { success: false, error: 'profile 为空' };
  }
  try {
    await db
      .collection('users')
      .doc(openid)
      .update({
        data: {
          ...(profile.nickName != null ? { nickName: profile.nickName } : {}),
          ...(profile.avatarUrl != null ? { avatarUrl: profile.avatarUrl } : {}),
          updated_at: new Date(),
        },
      });
    return { success: true };
  } catch (err) {
    console.error('[userService.updateProfile] 失败', err);
    return { success: false, error: err.message };
  }
}

async function loadStats() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const guard = ensureOpenid(openid);
  if (guard) return guard;
  try {
    const [ratingRes, collectRes] = await Promise.all([
      db.collection('ratings').where({ user_id: openid }).count(),
      db.collection('collections').where({ user_id: openid, type: 'collect' }).count(),
    ]);
    return {
      success: true,
      ratingCount: ratingRes.total || 0,
      collectCount: collectRes.total || 0,
    };
  } catch (err) {
    console.error('[userService.loadStats] 失败', err);
    return { success: false, error: err.message, ratingCount: 0, collectCount: 0 };
  }
}

exports.main = async (event /*, context*/) => {
  const action = event && event.action;
  switch (action) {
    case 'getInfo':
      return getInfo();
    case 'upsert':
      return upsert(event.profile);
    case 'updateProfile':
      return updateProfile(event.profile);
    case 'loadStats':
      return loadStats();
    default:
      return { success: false, error: `未知 action: ${action}` };
  }
};
