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
// aggregate 管道在 DB 端完成分组聚合，不再需要全量拉取评分文档

exports.main = async (event /*, context*/) => {
  const animationBvid = String(event.animation_bvid || '').trim();

  if (!animationBvid) {
    return { success: false, error: '缺少 animation_bvid' };
  }

  try {
    // 用 aggregate 管道在 DB 端按 score 分组，只返回分组结果（≤ 11 个）
    // 替代原来全量拉取（最多 10000 条）再 JS 遍历的方式
    const $ = db.command.aggregate;
    const aggRes = await db
      .collection('ratings')
      .aggregate()
      .match({ animation_bvid: animationBvid })
      .group({ _id: '$score', count: $.sum(1) })
      .end();
    const groups = aggRes.list || [];

    // 无评分时直接返回默认值
    if (groups.length === 0) {
      return { success: true, WR: 0, v: 0, R: 0, C: DEFAULT_C, distribution: {} };
    }

    // 由分组结果计算 v（总人数）、R（算术平均）、distribution
    let v = 0;
    let totalScore = 0;
    const distribution = {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const score = Number(g._id);
      const count = g.count || 0;
      if (!isFinite(score)) continue;
      v += count;
      totalScore += score * count;
      const key = score.toFixed(1);
      distribution[key] = (distribution[key] || 0) + count;
    }

    if (v === 0) {
      return { success: true, WR: 0, v: 0, R: 0, C: DEFAULT_C, distribution: {} };
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
