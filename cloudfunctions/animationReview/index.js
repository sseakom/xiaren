// cloudfunctions/animationReview/index.js
// 管理员审核入口（操作 submissions 集合；通过时按 type 落地到 animations）
// 入参：{ action, ...payload }
//   - action: 'list'      payload: { statusFilter?: [2,3] }
//                          列出 submissions（默认 status=2 待审），联表带回 submitter + target
//   - action: 'get'       payload: { _id }
//                          获取单条 submission 详情
//   - action: 'approve'   payload: { _id, comment? }
//                          通过 → 落地：
//                            type=create           : 写 animations(status=1)
//                            type=correction       : 合并到 animations.doc(target_id)
//                            type=correction_delete: 删除 animations.doc(target_id)
//                          然后 submissions.status=1
//   - action: 'reject'    payload: { _id, comment }
//                          驳回 → submissions.status=3，记录驳回原因
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/** 鉴权：调用方必须是 is_admin=true */
async function requireAdmin(openid) {
  if (!openid) return { success: false, error: '未登录' };
  try {
    const res = await db.collection('users').doc(openid).get();
    if (!res.data || !res.data.is_admin) {
      return { success: false, error: '无权限：仅管理员可操作' };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: '管理员鉴权失败' };
  }
}

/** 批量 join submitter 昵称 */
async function joinSubmitters(list) {
  const openids = Array.from(
    new Set(list.map((it) => it.submitter_openid).filter(Boolean)),
  );
  const userMap = {};
  if (openids.length) {
    const chunks = [];
    for (let i = 0; i < openids.length; i += 50) {
      chunks.push(openids.slice(i, i + 50));
    }
    for (const ids of chunks) {
      const uRes = await db.collection('users').where({ _id: _.in(ids) }).limit(50).get();
      (uRes.data || []).forEach((u) => {
        userMap[u._id] = u;
      });
    }
  }
  return list.map((it) => ({
    ...it,
    submitter: it.submitter_openid
      ? { nickName: userMap[it.submitter_openid]?.nickName || '匿名用户' }
      : { nickName: '匿名用户' },
  }));
}

/** 批量 join target（原动画摘要） */
async function joinTargets(list) {
  const ids = Array.from(
    new Set(list.map((it) => it.target_id).filter(Boolean)),
  );
  const animMap = {};
  if (ids.length) {
    // db 一次最多 50 个 _id in
    const chunks = [];
    for (let i = 0; i < ids.length; i += 50) {
      chunks.push(ids.slice(i, i + 50));
    }
    for (const chunk of chunks) {
      const aRes = await db.collection('animations').where({ _id: _.in(chunk) }).limit(50).get();
      (aRes.data || []).forEach((a) => {
        animMap[a._id] = {
          _id: a._id,
          title: a.title,
          bvid: a.bvid,
          up_name: a.up_name,
          cover: a.cover,
          duration: a.duration,
        };
      });
    }
  }
  return list.map((it) => ({
    ...it,
    target: it.target_id ? animMap[it.target_id] || null : null,
  }));
}

/** 列表 */
async function listAction(event) {
  const openid = cloud.getWXContext().OPENID;
  const guard = await requireAdmin(openid);
  if (!guard.success) return guard;

  const statusFilter = Array.isArray(event.statusFilter) ? event.statusFilter : [2];
  const typeFilter = Array.isArray(event.typeFilter) ? event.typeFilter : null;
  const where = { status: _.in(statusFilter) };
  if (typeFilter) where.type = _.in(typeFilter);

  try {
    const res = await db
      .collection('submissions')
      .where(where)
      .orderBy('submitted_at', 'desc')
      .limit(100)
      .get();
    let data = res.data || [];
    data = await joinSubmitters(data);
    data = await joinTargets(data);
    return { success: true, data };
  } catch (err) {
    console.error('[animationReview.list] 失败', err);
    return { success: false, error: err.message };
  }
}

/** 详情 */
async function getAction(event) {
  const openid = cloud.getWXContext().OPENID;
  const guard = await requireAdmin(openid);
  if (!guard.success) return guard;
  if (!event._id) return { success: false, error: '缺少 _id' };
  try {
    const res = await db.collection('submissions').doc(event._id).get();
    if (!res.data) return { success: false, error: '记录不存在' };
    let submitter = null;
    if (res.data.submitter_openid) {
      const u = await db.collection('users').doc(res.data.submitter_openid).get();
      if (u.data) submitter = { nickName: u.data.nickName, _id: u.data._id };
    }
    let target = null;
    if (res.data.target_id) {
      try {
        const a = await db.collection('animations').doc(res.data.target_id).get();
        if (a.data) {
          target = {
            _id: a.data._id,
            title: a.data.title,
            bvid: a.data.bvid,
            up_name: a.data.up_name,
            cover: a.data.cover,
            duration: a.data.duration,
          };
        }
      } catch (e) { /* 原动画已删除也允许 */ }
    }
    return { success: true, data: { ...res.data, submitter, target } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 落地 approve 操作
 * @returns 成功：null；失败：error message
 */
async function applySubmission(submission) {
  const p = submission.payload || {};
  if (submission.type === 'create') {
    const now = new Date();
    const doc = {
      title: String(p.title).trim(),
      bvid: String(p.bvid).trim(),
      url: p.url ? String(p.url).trim() : `https://www.bilibili.com/video/${p.bvid}`,
      up_name: String(p.up_name).trim(),
      cover: String(p.cover).trim(),
      duration: Number(p.duration),
      play_count: Number(p.play_count) || 0,
      like_count: Number(p.like_count) || 0,
      publish_time: new Date(p.publish_time),
      update_time: now,
      tag: String(p.tag).trim(),
      // 不再写 status：animations 集合忽略 status 字段
    };
    const r = await db.collection('animations').add({ data: doc });
    return null;
  } else if (submission.type === 'correction') {
    if (!submission.target_id) return 'correction 提交缺少 target_id';
    const now = new Date();
    await db.collection('animations').doc(submission.target_id).update({
      data: {
        title: String(p.title).trim(),
        tag: String(p.tag).trim(),
        update_time: now,
      },
    });
    return null;
  } else if (submission.type === 'correction_delete') {
    if (!submission.target_id) return 'correction_delete 提交缺少 target_id';
    await db.collection('animations').doc(submission.target_id).remove();
    return null;
  }
  return `不支持的 type: ${submission.type}`;
}

/** approve / reject 共用入口 */
async function decide(event, action) {
  const openid = cloud.getWXContext().OPENID;
  const guard = await requireAdmin(openid);
  if (!guard.success) return guard;
  if (!event._id) return { success: false, error: '缺少 _id' };
  if (action === 'reject' && !event.comment) {
    return { success: false, error: '驳回必须填写原因' };
  }
  try {
    const subRes = await db.collection('submissions').doc(event._id).get();
    if (!subRes.data) return { success: false, error: '记录不存在' };
    if (subRes.data.status !== 2) {
      return { success: false, error: '该提交已被处理' };
    }
    const sub = subRes.data;
    const now = new Date();
    if (action === 'approve') {
      const applyErr = await applySubmission(sub);
      if (applyErr) return { success: false, error: applyErr };
    }
    await db.collection('submissions').doc(event._id).update({
      data: {
        status: action === 'approve' ? 1 : 3,
        reviewer_openid: openid,
        review_time: now,
        review_comment: event.comment || '',
      },
    });
    return { success: true };
  } catch (err) {
    console.error('[animationReview.decide] 失败', err);
    return { success: false, error: err.message };
  }
}

exports.main = async (event /*, context*/) => {
  const action = event && event.action;
  switch (action) {
    case 'list':
      return listAction(event);
    case 'get':
      return getAction(event);
    case 'approve':
      return decide(event, 'approve');
    case 'reject':
      return decide(event, 'reject');
    default:
      return { success: false, error: `未知 action: ${action}` };
  }
};
