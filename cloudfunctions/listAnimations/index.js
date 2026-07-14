// cloudfunctions/listAnimations/index.js
// 首页列表云函数 - 快照模式（前端本地缓存 / 排序 / 搜索）
//
// 入参：{ action: 'snapshot' }
// 出参：{ success, data, total, page, pageSize }
//
// 说明：
//  前端动画列表 / 搜索 / 排序已全部迁移到本地快照（animationDataset.ts），
//  服务端仅响应 snapshot，返回精简后的全量列表。
//  历史的分页 / 排序 / 分类分支（canUseDbPagination / DB_SORT_CONFIG / compare /
//  matchCategory / 慢速全量路径）为死代码，已在阶段 0 清理（H-04）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function toSafeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeTagList(tag) {
  if (Array.isArray(tag)) {
    return tag.map((item) => normalizeString(item)).filter(Boolean);
  }
  return normalizeString(tag)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 首页/搜索只需要列表卡片字段；快照模式裁掉详情页和 DB 内部无关字段，
 * 以减少前端持久化体积。
 */
function toSnapshotItem(item) {
  const tags = normalizeTagList(item.tag);
  const score = Number(item.score);
  return {
    bvid: normalizeString(item.bvid),
    title: normalizeString(item.title),
    original_title: normalizeString(item.original_title),
    up_name: normalizeString(item.up_name),
    cover: normalizeString(item.cover),
    duration: parseDurationToSec(item.duration),
    play_count: toSafeNumber(item.play_count),
    danmaku_count: toSafeNumber(item.danmaku_count),
    like_count: toSafeNumber(item.like_count),
    publish_time: item.publish_time || '',
    tag: tags.join(','),
    tags,
    ...(Number.isFinite(score) ? { score } : {}),
  };
}

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

/**
 * 全量拉取 animations 集合（云开发单次 get 最多返回 100 条，需分页循环）
 * @returns 全部记录数组
 */
async function fetchAllAnimations() {
  const all = [];
  const BATCH = 100;
  let skip = 0;
  // 安全上限：最多拉 2000 条（本项目数据量 < 500，留余量）
  const MAX = 2000;
  while (skip < MAX) {
    const res = await db.collection('animations').skip(skip).limit(BATCH).get();
    const batch = res.data || [];
    all.push(...batch);
    if (batch.length < BATCH) break; // 没有更多了
    skip += BATCH;
  }
  return all;
}

/**
 * 把全量动画列表裁剪为快照项（字段裁剪 + bvid 过滤）
 * @param {any[]} all 全量动画记录
 * @returns {object[]} 快照项数组
 */
function buildSnapshotList(all) {
  return (all || [])
    .map((item) => toSnapshotItem(item))
    .filter((item) => item.bvid);
}

exports.main = async (event) => {
  const action = String(event.action || '');
  if (action !== 'snapshot') {
    return {
      success: false,
      error: `不支持的 action: ${action || '(空)'}，listAnimations 仅支持 snapshot`,
    };
  }

  try {
    const all = await fetchAllAnimations();
    const data = buildSnapshotList(all);
    return {
      success: true,
      data,
      total: data.length,
      page: 0,
      pageSize: data.length,
    };
  } catch (err) {
    console.error('[listAnimations] 失败', err);
    return {
      success: false,
      error: err.message,
      data: [],
      total: 0,
      page: 0,
      pageSize: 0,
    };
  }
};

// 导出纯函数供单测（不改变 exports.main 入口）
exports.toSnapshotItem = toSnapshotItem;
exports.buildSnapshotList = buildSnapshotList;
exports.parseDurationToSec = parseDurationToSec;
exports.normalizeTagList = normalizeTagList;
exports.toSafeNumber = toSafeNumber;
exports.normalizeString = normalizeString;
