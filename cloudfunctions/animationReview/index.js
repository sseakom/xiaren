// cloudfunctions/animationReview/index.js
// 管理员审核入口
// 入参：{ action, ...payload }
//   - action: 'list'
//       列出所有 status=2（审核中）的记录（带 submitter 昵称）
//       可选 statusFilter: [2,3] 自定义状态过滤（默认只查 2）
//       返回：{ success, data: AnimationSubmission[] }
//   - action: 'get'     payload: { _id }
//       获取单条详情（不限制状态，便于复核）
//       返回：{ success, data: AnimationSubmission }
//   - action: 'approve' payload: { _id, comment? }
//       管理员通过 → status=1，记录 reviewer_openid/review_time/review_comment
//       返回：{ success }
//   - action: 'reject'  payload: { _id, comment }
//       管理员驳回 → status=3，记录 reviewer_openid/review_time/review_comment
//       返回：{ success }
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

/** 列表：拉所有 status=2（默认）的待审记录，并 join 提交人昵称 */
async function listAction(event) {
  const openid = cloud.getWXContext().OPENID;
  const guard = await requireAdmin(openid);
  if (!guard.success) return guard;

  const statusFilter = Array.isArray(event.statusFilter) ? event.statusFilter : [2];
  try {
    const res = await db
      .collection('animations')
      .where({ status: _.in(statusFilter) })
      .orderBy('submitted_at', 'desc')
      .limit(100)
      .get();
    const list = res.data || [];
    // 收集 submitter_openid 去重
    const openids = Array.from(
      new Set(list.map((it) => it.submitter_openid).filter(Boolean)),
    );
    let userMap = {};
    if (openids.length) {
      // wx-server-sdk 单次最多 50 个 _id in
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
    const data = list.map((it) => ({
      ...it,
      submitter: it.submitter_openid
        ? {
            nickName: userMap[it.submitter_openid]?.nickName || '匿名用户',
          }
        : { nickName: '匿名用户' },
    }));
    return { success: true, data };
  } catch (err) {
    console.error('[animationReview.list] 失败', err);
    return { success: false, error: err.message };
  }
}

async function getAction(event) {
  const openid = cloud.getWXContext().OPENID;
  const guard = await requireAdmin(openid);
  if (!guard.success) return guard;
  if (!event._id) return { success: false, error: '缺少 _id' };
  try {
    const res = await db.collection('animations').doc(event._id).get();
    if (!res.data) return { success: false, error: '记录不存在' };
    // 附加提交人昵称
    let submitter = null;
    if (res.data.submitter_openid) {
      const u = await db.collection('users').doc(res.data.submitter_openid).get();
      if (u.data) {
        submitter = { nickName: u.data.nickName, _id: u.data._id };
      }
    }
    return { success: true, data: { ...res.data, submitter } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** 通用：通过 / 驳回 共用流程 */
async function decide(event, nextStatus) {
  const openid = cloud.getWXContext().OPENID;
  const guard = await requireAdmin(openid);
  if (!guard.success) return guard;
  if (!event._id) return { success: false, error: '缺少 _id' };
  if (nextStatus === 3 && !event.comment) {
    return { success: false, error: '驳回必须填写原因' };
  }
  try {
    const now = new Date();
    const update = {
      status: nextStatus,
      reviewer_openid: openid,
      review_time: now,
      review_comment: event.comment || '',
      update_time: now,
    };
    await db.collection('animations').doc(event._id).update({ data: update });
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
      return decide(event, 1);
    case 'reject':
      return decide(event, 3);
    default:
      return { success: false, error: `未知 action: ${action}` };
  }
};
