// cloudfunctions/userService/profile.js
// 纯函数：用户档案 sanitize / normalize（不 require('wx-server-sdk')，可直接被单测 import）
//
// 安全约束：绝不从 profile 读取 is_admin（仅控制台可改），normalizeUser 只取 existing.is_admin。
// 行为与原 userService/index.js 内联逻辑完全一致。

/** 仅保留客户端允许写入的档案字段，过滤 is_admin 等危险字段 */
function sanitizeProfileInput(profile) {
  const p = profile || {};
  return {
    nickName: p.nickName,
    avatarUrl: p.avatarUrl,
    phoneNumber: p.phoneNumber,
  };
}

/** 合并 openid + profile + existing 生成归一化用户文档 */
function normalizeUser(openid, profile, existing) {
  const p = profile || {};
  const e = existing || {};
  const now = new Date();
  return {
    _id: openid,
    nickName: p.nickName != null ? p.nickName : (e.nickName || ''),
    avatarUrl: p.avatarUrl != null ? p.avatarUrl : (e.avatarUrl || ''),
    phoneNumber: p.phoneNumber != null ? p.phoneNumber : (e.phoneNumber || ''),
    // 仅控制台可修改 is_admin，云函数不会从 profile 读取/覆盖
    is_admin: e.is_admin === undefined ? false : !!e.is_admin,
    created_at: e.created_at || now,
    updated_at: now,
  };
}

module.exports = { sanitizeProfileInput, normalizeUser };
