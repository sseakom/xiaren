// cloudfunctions/animationMySubmissions/index.js
// 用户查看自己的提交/勘误/申请删除记录（status in 2,3）
// 入参：{ statusFilter?: [2,3], typeFilter?: ['create'|'correction'|'correction_delete'] }
// 返回：{ success, data: Submission[] }  按 submitted_at 倒序
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
  const typeFilter = Array.isArray(event && event.typeFilter)
    ? event.typeFilter
    : null;

  const where = {
    submitter_openid: openid,
    status: _.in(statusFilter),
  };
  if (typeFilter) where.type = _.in(typeFilter);

  try {
    const res = await db
      .collection('submissions')
      .where(where)
      .orderBy('submitted_at', 'desc')
      .limit(50)
      .get();
    const data = res.data || [];

    return { success: true, data };
  } catch (err) {
    console.error('[animationMySubmissions] 失败', err);
    return { success: false, error: err.message };
  }
};
