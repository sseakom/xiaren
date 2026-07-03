// cloudfunctions/animationReview/index.js
// 管理员审核入口（操作 submissions 集合；通过时按 type 落地到 animations）
// 入参：{ action, ...payload }
//   - action: 'list'      列出 submissions（默认 status=2），联表带回 submitter + target
//   - action: 'get'       获取单条 submission 详情
//   - action: 'approve'   通过 → 落地到 animations → submissions.status=1
//   - action: 'reject'    驳回 → submissions.status=3
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// DB where _.in() 单次上限
const BATCH_SIZE = 50;

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
  const openids = list.map((it) => it.submitter_openid).filter(Boolean);
  const userMap = new Map();
  if (openids.length > 0) {
    const chunks = [];
    const uniqueOpenids = Array.from(new Set(openids));
    for (let i = 0; i < uniqueOpenids.length; i += BATCH_SIZE) {
      chunks.push(uniqueOpenids.slice(i, i + BATCH_SIZE));
    }
    const results = await Promise.all(
      chunks.map((chunk) =>
        db.collection('users').where({ _id: _.in(chunk) }).limit(BATCH_SIZE).get(),
      ),
    );
    results.forEach((res) => {
      (res.data || []).forEach((doc) => {
        userMap.set(doc._id, doc);
      });
    });
  }
  return list.map((it) => ({
    ...it,
    submitter: it.submitter_openid
      ? { nickName: userMap.get(it.submitter_openid)?.nickName || '匿名用户' }
      : { nickName: '匿名用户' },
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
    // 仅服务端 join submitter；target 动画摘要改由前端本地快照补齐
    data = await joinSubmitters(data);
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

    // 仅服务端查询 submitter；target 动画摘要改由前端本地快照补齐
    const submitter = await (
      res.data.submitter_openid
        ? db
            .collection('users')
            .doc(res.data.submitter_openid)
            .get()
            .then((u) => (u.data ? { nickName: u.data.nickName, _id: u.data._id } : null))
            .catch(() => null)
        : Promise.resolve(null)
    );

    return { success: true, data: { ...res.data, submitter } };
  } catch (err) {
    console.error('[animationReview.get] 失败', err);
    return { success: false, error: err.message };
  }
}

/**
 * 落地 approve 操作
 * @returns 成功：null；失败：error message
 */
async function applySubmission(submission) {
  const p = submission.payload || {};
  const now = new Date();

  if (submission.type === 'create') {
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
    };
    await db.collection('animations').add({ data: doc });
    return {
      type: submission.type,
      bvid: String(p.bvid).trim(),
    };
  }

  if (submission.type === 'correction') {
    if (!submission.target_bvid) return 'correction 提交缺少 target_bvid';
    const updateRes = await db
      .collection('animations')
      .where({ bvid: String(submission.target_bvid) })
      .update({
      data: {
        title: String(p.title).trim(),
        tag: String(p.tag).trim(),
        update_time: now,
      },
    });
    if (!updateRes.stats || updateRes.stats.updated < 1) return '原动画不存在';
    return {
      type: submission.type,
      targetBvid: String(submission.target_bvid || ''),
      bvid: String(submission.target_bvid || ''),
    };
  }

  if (submission.type === 'correction_delete') {
    if (!submission.target_bvid) return 'correction_delete 提交缺少 target_bvid';
    const removeRes = await db
      .collection('animations')
      .where({ bvid: String(submission.target_bvid) })
      .remove();
    if (!removeRes.stats || removeRes.stats.removed < 1) return '原动画不存在';
    return {
      type: submission.type,
      targetBvid: String(submission.target_bvid || ''),
      bvid: String(submission.target_bvid || ''),
    };
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

    const submission = subRes.data;
    let appliedMeta = null;

    if (action === 'approve') {
      const applyRes = await applySubmission(submission);
      if (typeof applyRes === 'string') return { success: false, error: applyRes };
      appliedMeta = applyRes;
    }

    await db.collection('submissions').doc(event._id).update({
      data: {
        status: action === 'approve' ? 1 : 3,
        reviewer_openid: openid,
        review_time: new Date(),
        review_comment: event.comment || '',
      },
    });
    return {
      success: true,
      data: {
        submissionId: String(event._id),
        submitterOpenid: String(submission.submitter_openid || ''),
        type: String(submission.type || ''),
        targetBvid: String(submission.target_bvid || ''),
        bvid: String(submission.payload?.bvid || ''),
        ...(appliedMeta || {}),
      },
    };
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
