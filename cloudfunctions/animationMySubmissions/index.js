// cloudfunctions/animationMySubmissions/index.js
// 用户查看自己的提交/勘误记录（status in 2,3）
// 入参：{ statusFilter?: [2,3] }
// 返回：{ success, data: AnimationSubmission[] }  按 submitted_at 倒序
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event /*, context*/) => {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { success: false, error: '未登录' };

  const statusFilter = Array.isArray(event && event.statusFilter)
    ? event.statusFilter
    : [2, 3];
  try {
    const res = await db
      .collection('animations')
      .where({
        submitter_openid: openid,
        status: _.in(statusFilter),
      })
      .orderBy('submitted_at', 'desc')
      .limit(50)
      .get();
    return { success: true, data: res.data || [] };
  } catch (err) {
    console.error('[animationMySubmissions] 失败', err);
    return { success: false, error: err.message };
  }
};
