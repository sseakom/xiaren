// cloudfunctions/animationSubmit/validation.js
// 纯函数：用户提交入参校验（不 require('wx-server-sdk')，可直接被单测 import）
// 行为与原 animationSubmit/index.js 内联校验完全一致。

const BV_REGEX = /^BV1[A-Za-z0-9]{8,}$/;

/** create 模式必填字段统一校验 */
function validateCreatePayload(p) {
  if (!p) return '表单为空';
  const required = ['title', 'bvid', 'up_name', 'cover', 'duration', 'publish_time', 'tag'];
  for (const k of required) {
    if (p[k] === undefined || p[k] === null || p[k] === '') {
      return `缺少必填字段：${k}`;
    }
  }
  if (typeof p.duration !== 'number' || p.duration <= 0) {
    return 'duration 必须为正数（秒）';
  }
  if (typeof p.bvid !== 'string' || !BV_REGEX.test(p.bvid)) {
    return 'bvid 格式不正确（应为 BV 开头 10+ 位的 B 站视频 ID）';
  }
  return null;
}

/** correction 模式只校验 title + tag */
function validateCorrectionPayload(p) {
  if (!p) return '表单为空';
  if (!p.title || !String(p.title).trim()) return '标题不能为空';
  if (!p.tag || !String(p.tag).trim()) return '标签不能为空';
  return null;
}

/** correction_delete 模式只校验 reason */
function validateDeletePayload(p) {
  if (!p) return '请填写删除理由';
  const reason = String(p.reason || '').trim();
  if (!reason) return '请填写删除理由';
  if (reason.length < 4) return '删除理由至少 4 个字';
  return null;
}

module.exports = {
  BV_REGEX,
  validateCreatePayload,
  validateCorrectionPayload,
  validateDeletePayload,
};
