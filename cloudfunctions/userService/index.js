// cloudfunctions/userService/index.js
// 用户业务统一入口。
// 入参：{ action, ...payload }
//   - action: 'getInfo'
//       读用户档案；不存在则按 openid upsert 一条空档案后返回
//       返回：{ success, data: User }  （data 含 is_admin 字段）
//   - action: 'upsert'      payload: { profile: { nickName, avatarUrl } }
//       upsert 用户档案（doc(openid).set()），已存在不报错
//       返回：{ success, data: User }
//   - action: 'updateProfile' payload: { profile: { nickName, avatarUrl } }
//       局部更新用户档案
//       返回：{ success }
//   - action: 'loadStats'
//       返回用户的 ratingCount / collectCount
//       返回：{ success, ratingCount, collectCount }
//   - action: 'setAdmin'     payload: { target_openid, is_admin }
//       鉴权：调用方必须当前已是 is_admin=true
//       设置目标用户的 is_admin 字段（true/false）
//       返回：{ success }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ensureOpenid(openid) {
  if (!openid) return { success: false, error: '未登录' };
  return null;
}

/** 读取完整用户档案（含 is_admin 字段，没有则补 false） */
async function getInfo() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const guard = ensureOpenid(openid);
  if (guard) return guard;
  try {
    const res = await db.collection('users').doc(openid).get();
    if (res.data) {
      // 兜底：老数据没有 is_admin 字段
      if (res.data.is_admin === undefined) res.data.is_admin = false;
      return { success: true, data: res.data };
    }
    // 不存在 → upsert 一条空档案
    const now = new Date();
    const profile = {
      _id: openid,
      nickName: '',
      avatarUrl: '',
      is_admin: false,
      created_at: now,
      updated_at: now,
    };
    try {
      await db.collection('users').doc(openid).set({ data: profile });
    } catch (e) {
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
    is_admin: false, // upsert 不允许借机提权
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

/**
 * 设置目标用户的管理员标记
 * 安全模型：调用方必须是当前已存在的管理员
 * 首个管理员需要在云开发控制台手动加 is_admin=true（避免任意用户自封管理员）
 */
async function setAdmin(payload) {
  const wxContext = cloud.getWXContext();
  const callerOpenid = wxContext.OPENID;
  const guard = ensureOpenid(callerOpenid);
  if (guard) return guard;
  const targetOpenid = payload && payload.target_openid;
  const isAdmin = !!(payload && payload.is_admin);
  if (!targetOpenid) {
    return { success: false, error: '缺少 target_openid' };
  }
  try {
    // 鉴权：调用方必须是管理员
    const callerRes = await db.collection('users').doc(callerOpenid).get();
    if (!callerRes.data || !callerRes.data.is_admin) {
      return { success: false, error: '无权限：仅管理员可操作' };
    }
    // 用 update 而不是 set：避免覆盖目标用户其他字段
    await db
      .collection('users')
      .doc(targetOpenid)
      .update({ data: { is_admin: isAdmin, updated_at: new Date() } });
    return { success: true };
  } catch (err) {
    console.error('[userService.setAdmin] 失败', err);
    return { success: false, error: err.message };
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
    case 'setAdmin':
      return setAdmin(event);
    default:
      return { success: false, error: `未知 action: ${action}` };
  }
};
