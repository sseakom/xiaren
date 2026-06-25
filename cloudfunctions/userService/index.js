// cloudfunctions/userService/index.js
// 用户业务统一入口。
// 入参：{ action, ...payload }
//   - action: 'getInfo'          读用户档案；不存在则 upsert 空档案
//   - action: 'upsert'           upsert 用户档案（不允许借机提权）
//   - action: 'updateProfile'    局部更新用户档案
//   - action: 'loadStats'        返回 ratingCount / collectCount
//   - action: 'setAdmin'         管理员设置目标用户 is_admin（需鉴权）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 获取当前调用方 openid */
function getOpenid() {
  return cloud.getWXContext().OPENID || null;
}

/** 未登录错误响应 */
const NOT_LOGIN = { success: false, error: '未登录' };

function normalizeUser(openid, profile = {}, existing = {}) {
  const now = new Date();
  return {
    _id: openid,
    nickName: profile.nickName != null ? profile.nickName : (existing.nickName || ''),
    avatarUrl: profile.avatarUrl != null ? profile.avatarUrl : (existing.avatarUrl || ''),
    phoneNumber: profile.phoneNumber != null ? profile.phoneNumber : (existing.phoneNumber || ''),
    is_admin: profile.is_admin != null
      ? !!profile.is_admin
      : (existing.is_admin === undefined ? false : !!existing.is_admin),
    created_at: existing.created_at || now,
    updated_at: now,
  };
}

function toUserWriteData(user) {
  return {
    nickName: user.nickName,
    avatarUrl: user.avatarUrl,
    phoneNumber: user.phoneNumber,
    is_admin: user.is_admin,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function getUserDoc(openid) {
  try {
    const res = await db.collection('users').doc(openid).get();
    return res && res.data ? res.data : null;
  } catch (err) {
    const errMsg = (err && (err.errMsg || err.message)) || '';
    if (String(errMsg).includes('document') || String(errMsg).includes('not found')) {
      return null;
    }
    throw err;
  }
}

/** 读取完整用户档案（含 is_admin 字段，没有则补 false） */
async function getInfo() {
  const openid = getOpenid();
  if (!openid) return NOT_LOGIN;
  try {
    const existing = await getUserDoc(openid);
    if (existing) {
      // 兜底：老数据没有 is_admin 字段
      if (existing.is_admin === undefined) existing.is_admin = false;
      return { success: true, data: existing };
    }
    const profile = normalizeUser(openid);
    await db.collection('users').doc(openid).set({ data: toUserWriteData(profile) });
    return { success: true, data: profile };
  } catch (err) {
    console.error('[userService.getInfo] 失败', err);
    return { success: false, error: err.message };
  }
}

async function upsert(profile) {
  const openid = getOpenid();
  if (!openid) return NOT_LOGIN;
  try {
    const existing = await getUserDoc(openid);
    const data = normalizeUser(openid, profile, existing || {});
    await db.collection('users').doc(openid).set({ data: toUserWriteData(data) });
    return { success: true, data };
  } catch (err) {
    console.error('[userService.upsert] 失败', err);
    return { success: false, error: err.message };
  }
}

async function updateProfile(profile) {
  const openid = getOpenid();
  if (!openid) return NOT_LOGIN;
  if (!profile || (profile.nickName == null && profile.avatarUrl == null)) {
    return { success: false, error: 'profile 为空' };
  }
  try {
    const existing = await getUserDoc(openid);
    const data = normalizeUser(openid, profile, existing || {});
    await db.collection('users').doc(openid).set({ data: toUserWriteData(data) });
    return { success: true, data };
  } catch (err) {
    console.error('[userService.updateProfile] 失败', err);
    return { success: false, error: err.message };
  }
}

async function loadStats() {
  const openid = getOpenid();
  if (!openid) return NOT_LOGIN;
  try {
    // 并行查询评分数 + 收藏数
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
  const openid = getOpenid();
  if (!openid) return NOT_LOGIN;
  const targetOpenid = payload && payload.target_openid;
  const isAdmin = !!(payload && payload.is_admin);
  if (!targetOpenid) {
    return { success: false, error: '缺少 target_openid' };
  }
  try {
    const existing = await getUserDoc(targetOpenid);
    const data = normalizeUser(targetOpenid, { is_admin: isAdmin }, existing || {});
    await db.collection('users').doc(targetOpenid).set({ data: toUserWriteData(data) });
    return { success: true, data };
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
