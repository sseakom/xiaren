// cloudfunctions/animationSubmit/index.js
// 用户提交入口（写入 submissions 集合，不直接操作 animations）
// 入参：
//   - type: 'create' | 'correction' | 'correction_delete'
//   - payload:        类型对应的数据
//   - target_bvid?:   correction / correction_delete 必传（原动画 bvid）
//   - action: 'checkBvidUnique' | 'cancel' （独立 action 分发）
// 返回：{ success, data: { _id, status } } 或 { success: false, error }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 校验逻辑抽离到无 wx-server-sdk 依赖的纯模块（行为不变，供单测直接 import）
const { validateCreatePayload, validateCorrectionPayload, validateDeletePayload } = require('./validation');

/**
 * bvid 唯一性校验（仅 create 模式）
 *  - animations 主表占用由前端本地全量快照校验
 *  - 云端只校验 submissions 集合中是否已有 pending 的 create 提交
 */
async function checkBvidUnique(bvid) {
  // 查 submissions 集合 pending 的 create 提交（直接 DB 精确匹配）
  const subRes = await db
    .collection('submissions')
    .where({ type: 'create', status: 2, 'payload.bvid': bvid })
    .limit(1)
    .get();
  return (subRes.data || []).length === 0;
}

async function checkBvidUniqueAction(bvid) {
  const ok = await checkBvidUnique(bvid);
  return { success: true, data: { unique: ok } };
}

async function submit(event) {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { success: false, error: '未登录' };

  // 防御性拦截：action 字段应由 exports.main 分发，不应进入 submit
  if (event.action) {
    return { success: false, error: `submit 不处理 action: ${event.action}` };
  }

  const type = event.type || (event.mode === 'correction' ? 'correction' : 'create');
  const payload = event.payload || {};

  // 按类型校验
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

  // correction / correction_delete 仅校验 target_bvid 非空；
  // 原动画存在性由前端本地快照预校验，管理员审批时再用写路径结果兜底。
  let targetBvid = null;
  if (type === 'correction' || type === 'correction_delete') {
    targetBvid = event.target_bvid || event.correction_of || null;
    if (!targetBvid) {
      return { success: false, error: '缺少原动画 bvid（target_bvid）' };
    }
    targetBvid = String(targetBvid || '');
  }

  // create 模式做 bvid 唯一性校验
  if (type === 'create') {
    const unique = await checkBvidUnique(payload.bvid);
    if (!unique) {
      return { success: false, error: 'bvid 已存在（已被使用或正在审核中）' };
    }
  }

  const doc = {
    type,
    target_bvid: targetBvid || null,
    payload,
    status: 2,
    submitter_openid: openid,
    submitted_at: new Date(),
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
  if (event.action === 'checkBvidUnique') {
    return checkBvidUniqueAction(event.bvid);
  }
  if (event.action === 'cancel') {
    return cancelAction(event);
  }
  return submit(event);
};
