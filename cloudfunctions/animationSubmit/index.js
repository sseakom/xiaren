// cloudfunctions/animationSubmit/index.js
// 用户提交入口（写入 submissions 集合，不直接操作 animations）
// 入参：
//   - type: 'create' | 'correction' | 'correction_delete'
//       create           → payload 为完整动画字段；通过后写入 animations
//       correction       → payload 为 { title, tag }；通过后合并到 animations.doc(target_id)
//       correction_delete→ payload 为 { reason }；通过后删除 animations.doc(target_id)
//   - payload:        类型对应的数据（见上）
//   - target_id?:     correction / correction_delete 必传（原动画 _id）
// 返回：{ success, data: { _id, status } } 或 { success: false, error }
//
// 校验规则：
//   1. create: 必填 title/bvid/up_name/cover/duration/publish_time/tag；bvid 格式 + 唯一性
//   2. correction: 必填 title + tag；target_id 指向 status=1 的原动画
//   3. correction_delete: 必填 reason（>= 4 字）；target_id 指向 status=1 的原动画
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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
  if (typeof p.bvid !== 'string' || !/^BV1[A-Za-z0-9]{8,}$/.test(p.bvid)) {
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

/**
 * bvid 唯一性校验（仅 create 模式）
 *  - animations 集合不再有 status 字段，直接查重
 *  - 查 submissions 集合（status=2，未被驳回且未通过）
 */
async function checkBvidUnique(bvid) {
  const animRes = await db
    .collection('animations')
    .where({ bvid })
    .limit(5)
    .get();
  if ((animRes.data || []).length > 0) return false;
  // 查 pending 状态的 create 提交
  const subRes = await db
    .collection('submissions')
    .where({ type: 'create', status: 2 })
    .limit(100)
    .get();
  return !(subRes.data || []).some((s) => s.payload && s.payload.bvid === bvid);
}

async function checkBvidUniqueAction(bvid) {
  const ok = await checkBvidUnique(bvid);
  return { success: true, data: { unique: ok } };
}

async function submit(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '未登录' };

  // 防御性拦截：exports.main 应已处理，但若主入口 action 分发被漏掉，
  // 防止 action 字段被忽略、type 默认 create 而误报 "缺少必填字段：title"
  if (event.action) {
    return { success: false, error: `submit 不处理 action: ${event.action}` };
  }

  const type = event.type || (event.mode === 'correction' ? 'correction' : 'create');
  const payload = event.payload || {};

  if (type === 'create') {
    const err = validateCreatePayload(payload);
    if (err) return { success: false, error: err };
  } else if (type === 'correction') {
    const err = validateCorrectionPayload(payload);
    if (err) return { success: false, error: err };
  } else if (type === 'correction_delete') {
    const err = validateDeletePayload(payload);
    if (err) return { success: false, error: err };
  } else {
    return { success: false, error: '不支持的 type' };
  }

  let targetId = null;
  if (type === 'correction' || type === 'correction_delete') {
    targetId = event.target_id || event.correction_of;
    if (!targetId) {
      return { success: false, error: '缺少原动画 id（target_id）' };
    }
    let orig;
    try {
      orig = await db.collection('animations').doc(targetId).get();
    } catch (e) {
      return { success: false, error: '原动画不存在' };
    }
    if (!orig.data) {
      return { success: false, error: '原动画不存在' };
    }
    // 不校验 status：下架(status=0)/待审(status=2) 的动画也应允许被勘误/申请删除
  }

  // create 模式做 bvid 唯一性校验
  if (type === 'create') {
    const unique = await checkBvidUnique(payload.bvid);
    if (!unique) {
      return { success: false, error: 'bvid 已存在（已被使用或正在审核中）' };
    }
  }

  const now = new Date();
  const doc = {
    type,
    target_id: targetId || null,
    payload,
    status: 2,
    submitter_openid: openid,
    submitted_at: now,
  };

  try {
    const res = await db.collection('submissions').add({ data: doc });
    return { success: true, data: { _id: res._id, status: 2 } };
  } catch (e) {
    console.error('[animationSubmit] 写入失败', e);
    return { success: false, error: e.message };
  }
}

/**
 * 提交人主动取消自己的 submission（仅 status=2 允许）
 *  - 校验 submitter_openid == openid
 *  - db.collection('submissions').doc(_id).remove()
 */
async function cancelAction(event) {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { success: false, error: '未登录' };
  if (!event._id) return { success: false, error: '缺少 _id' };
  try {
    const doc = await db.collection('submissions').doc(event._id).get();
    if (!doc.data) return { success: false, error: '记录不存在' };
    if (doc.data.submitter_openid !== openid) {
      return { success: false, error: '只能取消自己的提交' };
    }
    if (doc.data.status !== 2) {
      return { success: false, error: '仅审核中的提交可取消' };
    }
    await db.collection('submissions').doc(event._id).remove();
    return { success: true, data: { _id: event._id } };
  } catch (err) {
    console.error('[animationSubmit.cancel] 失败', err);
    return { success: false, error: err.message };
  }
}

exports.main = async (event /*, context*/) => {
  // 提供独立 action 用于前端实时校验
  if (event.action === 'checkBvidUnique') {
    return checkBvidUniqueAction(event.bvid);
  }
  if (event.action === 'cancel') {
    return cancelAction(event);
  }
  return submit(event);
};
