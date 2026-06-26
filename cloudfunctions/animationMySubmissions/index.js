// cloudfunctions/animationMySubmissions/index.js
// 用户查看自己的提交/勘误/申请删除记录（status in 2,3）
// 入参：{ statusFilter?: [2,3], typeFilter?: ['create'|'correction'|'correction_delete'] }
// 返回：{ success, data: Submission[] }  按 submitted_at 倒序
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// DB where _.in() 单次上限
const BATCH_SIZE = 50;

async function batchGetAnimationsByBvids(bvids, fieldFn) {
  if (!bvids || bvids.length === 0) return new Map();
  const uniqueBvids = Array.from(new Set(bvids.filter(Boolean)));
  if (uniqueBvids.length === 0) return new Map();

  const chunks = [];
  for (let i = 0; i < uniqueBvids.length; i += BATCH_SIZE) {
    chunks.push(uniqueBvids.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) => {
      let query = db.collection('animations').where({ bvid: _.in(chunk) }).limit(BATCH_SIZE);
      if (fieldFn) query = query.field(fieldFn());
      return query.get();
    }),
  );

  const map = new Map();
  results.forEach((res) => {
    (res.data || []).forEach((doc) => {
      map.set(doc.bvid, doc);
    });
  });
  return map;
}

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

    // 联表：correction / correction_delete 带回原动画摘要
    const targetBvids = data.map((s) => s.target_bvid).filter(Boolean);
    if (targetBvids.length > 0) {
      const animMapByBvid = await batchGetAnimationsByBvids(targetBvids, () => ({
        _id: true,
        title: true,
        bvid: true,
        up_name: true,
        cover: true,
      }));
      data.forEach((s) => {
        s.target = s.target_bvid ? animMapByBvid.get(s.target_bvid) || null : null;
      });
    }

    return { success: true, data };
  } catch (err) {
    console.error('[animationMySubmissions] 失败', err);
    return { success: false, error: err.message };
  }
};
