// cloudfunctions/getAnimationById/index.js
// 通过 _id 读取单个动画。
// 入参：{ id }
// 出参：{ success, data } | { success:false, error }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event /*, context*/) => {
  const id = event && event.id;
  if (!id) {
    return { success: false, error: '缺少 id' };
  }
  try {
    const res = await db.collection('animations').doc(String(id)).get();
    return { success: true, data: res.data || null };
  } catch (err) {
    console.error('[getAnimationById] 失败', err);
    return { success: false, error: err.message };
  }
};
