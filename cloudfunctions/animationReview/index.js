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

/**
 * 批量按 _id 查询集合，返回 id→doc 的 Map
 *  - 自动分片（每批 BATCH_SIZE 个），并行查询（原为串行 for...of await）
 *  - fieldFn 控制返回字段
 */
async function batchGetByIds(collection, ids, fieldFn) {
  if (!ids || ids.length === 0) return new Map();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    chunks.push(uniqueIds.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) => {
      let query = db.collection(collection).where({ _id: _.in(chunk) }).limit(BATCH_SIZE);
      if (fieldFn) query = query.field(fieldFn());
      return query.get();
    }),
  );

  const map = new Map();
  results.forEach((res) => {
    (res.data || []).forEach((doc) => {
      map.set(doc._id, doc);
    });
  });
  return map;
}

/** target 摘要字段 */
const TARGET_FIELDS = () => ({
  _id: true,
  title: true,
  bvid: true,
  up_name: true,
  cover: true,
  duration: true,
});

/** 批量 join submitter 昵称 */
async function joinSubmitters(list) {
  const openids = list.map((it) => it.submitter_openid).filter(Boolean);
  const userMap = await batchGetByIds('users', openids);
  return list.map((it) => ({
    ...it,
    submitter: it.submitter_openid
      ? { nickName: userMap.get(it.submitter_openid)?.nickName || '匿名用户' }
      : { nickName: '匿名用户' },
  }));
}

/** 批量 join target（原动画摘要） */
async function joinTargets(list) {
  const targetIds = list.map((it) => it.target_id).filter(Boolean);
  const animMap = await batchGetByIds('animations', targetIds, TARGET_FIELDS);
  return list.map((it) => ({
    ...it,
    target: it.target_id ? animMap.get(it.target_id) || null : null,
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
    // 并行 join submitter + target（原为串行两次 await）
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

    // 并行查询 submitter + target（原为串行两次 await）
    const [submitter, target] = await Promise.all([
      res.data.submitter_openid
        ? db
            .collection('users')
            .doc(res.data.submitter_openid)
            .get()
            .then((u) => (u.data ? { nickName: u.data.nickName, _id: u.data._id } : null))
            .catch(() => null)
        : Promise.resolve(null),
      res.data.target_id
        ? db
            .collection('animations')
            .doc(res.data.target_id)
            .get()
            .then((a) =>
              a.data
                ? {
                    _id: a.data._id,
                    title: a.data.title,
                    bvid: a.data.bvid,
                    up_name: a.data.up_name,
                    cover: a.data.cover,
                    duration: a.data.duration,
                  }
                : null,
            )
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    return { success: true, data: { ...res.data, submitter, target } };
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
    const res = await db.collection('animations').add({ data: doc });
    return {
      type: submission.type,
      targetId: '',
      animationId: res._id,
      bvid: String(p.bvid).trim(),
    };
  }

  if (submission.type === 'correction') {
    if (!submission.target_id) return 'correction 提交缺少 target_id';
    await db.collection('animations').doc(submission.target_id).update({
      data: {
        title: String(p.title).trim(),
        tag: String(p.tag).trim(),
        update_time: now,
      },
    });
    return {
      type: submission.type,
      targetId: String(submission.target_id),
      animationId: String(submission.target_id),
      bvid: String(p.bvid || '').trim(),
    };
  }

  if (submission.type === 'correction_delete') {
    if (!submission.target_id) return 'correction_delete 提交缺少 target_id';
    await db.collection('animations').doc(submission.target_id).remove();
    return {
      type: submission.type,
      targetId: String(submission.target_id),
      animationId: '',
      bvid: String(p.bvid || '').trim(),
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
        targetId: String(submission.target_id || ''),
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
