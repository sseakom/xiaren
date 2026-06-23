// cloudfunctions/listAnimations/index.js
// 首页列表云函数 - 服务端分页 + 排序
//
// 入参：{ page, pageSize, sortBy }
//   - page      页码（从 0 开始）
//   - pageSize  每页条数（默认 20）
//   - sortBy    'publish_time' | 'play_count' | 'duration_asc' | 'duration_desc'
//
// 出参：{ success, data, total, page, pageSize }
//   - data      当前页数据
//   - total     全表总数（前端用于计算 hasMore）
//
// 实现说明：
//   - duration 字段在 DB 里既可能是数字（秒）也可能是 "1000:23" / "1:23:45" 字符串，
//     DB 端 orderBy 只能字典序排字符串，不能正确按时间长短排。
//   - 所有排序统一放到 JS 内存里做（数据量 < 1000 完全没问题），
//     保证 duration 排序按"冒号前的分钟数"（即总秒数）正确生效。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 把 duration 字段统一解析成秒数
 *   - number         → 原值
 *   - "1000:23"      → 1000 * 60 + 23
 *   - "1:23:45"      → 1 * 3600 + 23 * 60 + 45
 *   - "285"          → 285
 *   - 其他/空        → 0
 */
function parseDurationToSec(d) {
  if (d == null) return 0;
  if (typeof d === 'number') {
    return isFinite(d) && d >= 0 ? d : 0;
  }
  const str = String(d).trim();
  if (!str) return 0;
  // mm:ss 或 hh:mm:ss
  if (/^\d+(:\d+){1,2}$/.test(str)) {
    const parts = str.split(':').map(Number);
    if (parts.length === 2) {
      const [m, s] = parts;
      return m * 60 + s;
    }
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  // 纯数字字符串
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = Number(str);
    return isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

/** 排序比较器：按 sortBy 计算 key，按 key 比较 */
function compare(a, b, sortBy) {
  switch (sortBy) {
    case 'play_count':
      return (b.play_count || 0) - (a.play_count || 0);
    case 'duration_asc':
      return parseDurationToSec(a.duration) - parseDurationToSec(b.duration);
    case 'duration_desc':
      return parseDurationToSec(b.duration) - parseDurationToSec(a.duration);
    case 'publish_time':
    default:
      return (
        new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime()
      );
  }
}

exports.main = async (event) => {
  const page = Number(event.page) || 0;
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 20, 1), 100);
  const sortBy = String(event.sortBy || 'publish_time');

  try {
    // 1) 一次拉全量（云开发单次 max 1000，本项目 < 500）
    const res = await db.collection('animations').limit(1000).get();
    const all = res.data || [];

    // 2) 内存排序
    const sorted = [...all].sort((a, b) => compare(a, b, sortBy));

    // 3) 切片
    const total = sorted.length;
    const start = page * pageSize;
    const data = sorted.slice(start, start + pageSize);

    return {
      success: true,
      data,
      total,
      page,
      pageSize,
    };
  } catch (err) {
    console.error('[listAnimations] 失败', err);
    return {
      success: false,
      error: err.message,
      data: [],
      total: 0,
      page,
      pageSize,
    };
  }
};
