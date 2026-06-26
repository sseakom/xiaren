// cloudfunctions/calcScore/index.js
// 动画贝叶斯评分计算
// WR = (v / (v + m)) × R + (m / (v + m)) × C
//   R = 动画算术平均分
//   v = 动画评分人数
//   m = 最低评分阈值（默认 10）
//   C = 全局平均分
//
// 入参：{ animation_bvid }
// 出参：{ success, WR, R, v, C, distribution }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 最低评分阈值：评分人数低于此值时，WR 向全局平均分 C 靠拢
const M_THRESHOLD = 10;
// 默认全局平均分（5 分制的中间值）
const DEFAULT_C = 3.5;
// 单次查询上限（云开发默认 1000，显式拉高避免静默截断）
const MAX_RATINGS = 10000;

exports.main = async (event /*, context*/) => {
  const animationBvid = String(event.animation_bvid || '').trim();

  if (!animationBvid) {
    return { success: false, error: '缺少 animation_bvid' };
  }

  try {
    const ratingsRes = await db
      .collection('ratings')
      .where({ animation_bvid: animationBvid })
      .limit(MAX_RATINGS)
      .get();
    const ratings = ratingsRes.data || [];
    const v = ratings.length; // 评分人数

    if (v === 0) {
      return { success: true, WR: 0, v: 0, R: 0, C: DEFAULT_C, distribution: {} };
    }

    // 2. 单次遍历：算术平均分 R + 评分分布
    let totalScore = 0;
    const distribution = {};
    for (let i = 0; i < ratings.length; i++) {
      const score = ratings[i].score;
      totalScore += score;
      const key = score.toFixed(1);
      distribution[key] = (distribution[key] || 0) + 1;
    }
    const R = totalScore / v;

    // 3. 获取全局平均分 C（失败时降级用默认值，不阻塞主流程）
    let C = DEFAULT_C;
    try {
      const configRes = await db
        .collection('config')
        .where({ key: 'global_avg_score' })
        .limit(1)
        .get();
      if (configRes.data && configRes.data.length > 0) {
        C = Number(configRes.data[0].value) || DEFAULT_C;
      }
    } catch (e) {
      console.warn('[calcScore] 获取全局平均分配置失败，使用默认值', e);
    }

    // 4. 贝叶斯加权公式
    const denominator = v + M_THRESHOLD;
    const WR = (v / denominator) * R + (M_THRESHOLD / denominator) * C;

    return {
      success: true,
      WR: parseFloat(WR.toFixed(2)),
      R: parseFloat(R.toFixed(2)),
      v,
      C,
      distribution,
    };
  } catch (err) {
    console.error('[calcScore] 失败', err);
    return { success: false, error: err.message };
  }
};
