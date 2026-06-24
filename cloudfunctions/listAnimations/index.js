// cloudfunctions/listAnimations/index.js
// 首页列表云函数 - 服务端分页 + 排序
//
// 入参：{ page, pageSize, sortBy, category }
//   - page      页码（从 0 开始）
//   - pageSize  每页条数（默认 20，上限 100）
//   - sortBy    'publish_time' | 'play_count' | 'duration_asc' | 'duration_desc'
//   - category  分类筛选（对应 tag 中的某一项，空字符串表示不筛选）
//
// 出参：{ success, data, total, page, pageSize }
//
// 性能优化：
//   - duration 字段在 DB 里是数字/字符串混合，DB orderBy 无法正确按时长排序 → 内存排序
//   - category 是模糊匹配 tag/original_title，DB where 无法精确表达 → 内存过滤
//   - 以上两种场景必须全量加载（数据量 < 1000）
//   - 其余场景（publish_time / play_count + 无 category）走 DB orderBy + skip/limit，避免全量加载
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
      return parts[0] * 60 + parts[1];
    }
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
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
      return new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime();
  }
}

/**
 * 判断某条动画是否匹配 category（模糊匹配）
 *  - 优先匹配 tag（逗号分隔字符串或数组）
 *  - 其次匹配 original_title
 *  - 不区分大小写
 */
function matchCategory(item, category) {
  if (!category) return true;
  const q = String(category).toLowerCase().trim();
  if (!q) return true;

  // 1) 优先匹配 tag
  const tag = item.tag;
  if (tag) {
    const tags = Array.isArray(tag)
      ? tag.map((t) => String(t).toLowerCase().trim())
      : String(tag).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tags.some((t) => t.includes(q))) return true;
  }

  // 2) 其次匹配 original_title
  if (item.original_title) {
    const title = String(item.original_title).toLowerCase().trim();
    if (title.includes(q)) return true;
  }

  return false;
}

/**
 * 判断是否可以走 DB 端分页（无需全量加载）
 *  - 无 category 筛选
 *  - sortBy 为 publish_time 或 play_count（DB 能直接 orderBy）
 */
function canUseDbPagination(sortBy, category) {
  return !category && (sortBy === 'publish_time' || sortBy === 'play_count');
}

/** DB 端排序字段映射 */
const DB_SORT_FIELD = {
  publish_time: 'publish_time',
  play_count: 'play_count',
};

exports.main = async (event) => {
  const page = Math.max(Number(event.page) || 0, 0);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 20, 1), 100);
  const sortBy = String(event.sortBy || 'publish_time');
  const category = String(event.category || '').trim();

  try {
    // ---- 快速路径：DB 端分页（无 category + publish_time/play_count 排序）----
    if (canUseDbPagination(sortBy, category)) {
      const sortField = DB_SORT_FIELD[sortBy];
      const skip = page * pageSize;

      // 并行：count 总数 + 分页数据
      const [cntRes, dataRes] = await Promise.all([
        db.collection('animations').count(),
        db
          .collection('animations')
          .orderBy(sortField, 'desc')
          .skip(skip)
          .limit(pageSize)
          .get(),
      ]);

      return {
        success: true,
        data: dataRes.data || [],
        total: cntRes.total || 0,
        page,
        pageSize,
      };
    }

    // ---- 慢速路径：全量加载 + 内存过滤/排序（duration 排序或 category 筛选）----
    const res = await db.collection('animations').limit(1000).get();
    let all = res.data || [];

    // 分类筛选
    if (category) {
      all = all.filter((it) => matchCategory(it, category));
    }

    // 内存排序
    const sorted = all.sort((a, b) => compare(a, b, sortBy));

    // 切片
    const total = sorted.length;
    const start = page * pageSize;
    const data = sorted.slice(start, start + pageSize);

    return { success: true, data, total, page, pageSize };
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
