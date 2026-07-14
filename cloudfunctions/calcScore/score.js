// cloudfunctions/calcScore/score.js
// 纯函数：贝叶斯加权评分计算（不 require('wx-server-sdk')，可直接被单测 import）
//
// WR = (v / (v + m)) × R + (m / (v + m)) × C
//   R = 动画算术平均分
//   v = 动画评分人数
//   m = 最低评分阈值（默认 10）
//   C = 全局平均分
// 行为与原 calcScore/index.js 内联计算完全一致。

/**
 * 由分组聚合结果计算贝叶斯加权评分
 * @param {Array<{_id:number, count:number}>} groups aggregate 管道按 score 分组的结果
 * @param {{m:number, C:number}} opts m=最低评分阈值，C=全局平均分
 * @returns {{WR:number, R:number, v:number, C:number, distribution:Record<string,number>}}
 */
function computeBayesianScore(groups, opts) {
  const m = opts && opts.m;
  const C = opts && opts.C;
  let v = 0;
  let totalScore = 0;
  const distribution = {};
  const list = Array.isArray(groups) ? groups : [];
  for (let i = 0; i < list.length; i += 1) {
    const g = list[i];
    const score = Number(g && g._id);
    const count = (g && g.count) || 0;
    if (!isFinite(score)) continue;
    v += count;
    totalScore += score * count;
    const key = score.toFixed(1);
    distribution[key] = (distribution[key] || 0) + count;
  }
  if (v === 0) {
    return { WR: 0, v: 0, R: 0, C, distribution: {} };
  }
  const R = totalScore / v;
  const denominator = v + m;
  const WR = (v / denominator) * R + (m / denominator) * C;
  return {
    WR: parseFloat(WR.toFixed(2)),
    R: parseFloat(R.toFixed(2)),
    v,
    C,
    distribution,
  };
}

module.exports = { computeBayesianScore };
