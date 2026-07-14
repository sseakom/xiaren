// cloudfunctions/userService/index.js
// 用户业务统一入口。
// 入参：{ action, ...payload }
//   - action: 'getInfo'          读用户档案；不存在则 upsert 空档案
//   - action: 'upsert'           upsert 用户档案（不允许借机提权）
//   - action: 'updateProfile'    局部更新用户档案
//   - action: 'loadStats'        返回 ratingCount / collectCount / watchCount
//
// 【安全约束】
// - 无 setAdmin 接口；设置/取消管理员需直接在云开发控制台手动修改 users 文档
// - upsert/updateProfile 会自动过滤客户端传入的 is_admin，仅控制台可更改
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 档案 sanitize / normalize 抽离到无 wx-server-sdk 依赖的纯模块（行为不变，供单测直接 import）
const { sanitizeProfileInput, normalizeUser } = require('./profile');

/** 获取当前调用方 openid */
function getOpenid() {
  return cloud.getWXContext().OPENID || null;
}

/** 未登录错误响应 */
const NOT_LOGIN = { success: false, error: '未登录' };

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
    const data = normalizeUser(openid, sanitizeProfileInput(profile), existing || {});
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
    const data = normalizeUser(openid, sanitizeProfileInput(profile), existing || {});
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
    // 并行查询评分数 + 收藏数 + 看过数
    const [ratingRes, collectRes, watchRes] = await Promise.all([
      db.collection('ratings').where({ user_id: openid }).count(),
      db.collection('collections').where({ user_id: openid, type: 'collect' }).count(),
      db.collection('collections').where({ user_id: openid, type: 'watched' }).count(),
    ]);
    return {
      success: true,
      ratingCount: ratingRes.total || 0,
      collectCount: collectRes.total || 0,
      watchCount: watchRes.total || 0,
    };
  } catch (err) {
    console.error('[userService.loadStats] 失败', err);
    return { success: false, error: err.message, ratingCount: 0, collectCount: 0, watchCount: 0 };
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
