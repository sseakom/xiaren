// cloudfunctions/getAnimationById/index.js
// 通过 bvid 读取单个动画。
// 入参：{ bvid }
// 出参：{ success, data } | { success:false, error }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event /*, context*/) => {
  const bvid = event && event.bvid;
  if (!bvid) {
    return { success: false, error: '缺少 bvid' };
  }
  try {
    const res = await db.collection('animations').where({ bvid: String(bvid) }).limit(1).get();
    return { success: true, data: (res.data && res.data[0]) || null };
  } catch (err) {
    console.error('[getAnimationByIdByBvid] 失败', err);
    return { success: false, error: err.message };
  }
};
