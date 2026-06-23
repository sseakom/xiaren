// cloudfunctions/calcScore/index.js
// 动画表已不再存储评分聚合字段,本函数仅做贝叶斯评分计算并返回结果
// WR = (v / (v + m)) × R + (m / (v + m)) × C
//
// R = 动画算术平均分
// v = 动画评分人数
// m = 最低评分阈值（默认10）
// C = 全局平均分
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { animation_id } = event;
  const M = 10; // 最低评分阈值

  if (!animation_id) {
    return { success: false, error: '缺少 animation_id' };
  }

  try {
    // 1. 获取该动画所有评分
    const ratingsRes = await db.collection('ratings')
      .where({ animation_id })
      .get();

    const ratings = ratingsRes.data;
    const v = ratings.length; // 评分人数

    if (v === 0) {
      return { success: true, WR: 0, v: 0, R: 0 };
    }

    // 2. 计算算术平均分 R
    const totalScore = ratings.reduce((sum, r) => sum + r.score, 0);
    const R = totalScore / v;

    // 3. 计算评分分布
    const distribution = {};
    ratings.forEach(r => {
      const key = r.score.toFixed(1);
      distribution[key] = (distribution[key] || 0) + 1;
    });

    // 4. 获取全局平均分 C
    let C = 3.5; // 默认值（5分制的中间值）
    try {
      const configRes = await db.collection('config')
        .where({ key: 'global_avg_score' })
        .get();
      if (configRes.data.length > 0) {
        C = configRes.data[0].value;
      }
    } catch (e) {
      console.warn('获取全局平均分配置失败，使用默认值', e);
    }

    // 5. 贝叶斯加权公式
    const WR = (v / (v + M)) * R + (M / (v + M)) * C;

    return {
      success: true,
      WR: parseFloat(WR.toFixed(2)),
      R: parseFloat(R.toFixed(2)),
      v,
      C,
      distribution
    };
  } catch (err) {
    console.error('calcScore 失败', err);
    return { success: false, error: err.message };
  }
};
