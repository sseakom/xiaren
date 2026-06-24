// cloudfunctions/search/index.js
// 模糊搜索云函数
// 入参：{ keyword, page?, pageSize?, category? }
// 出参：{ data, total, page, pageSize }
//
// 优化点：
//   - 合并 fuzzyMatch + fuzzyScore 为单次遍历：原代码先 filter(fuzzyMatch) 再 map(fuzzyScore)
//     每条记录的 title/up_name/tag 被 tokenize 两次；现合并为一次 map 返回 score，
//     score>0 即匹配，省去整遍 filter
//   - 修复变量名拼写：tagcore → tagScore
//   - 预计算 keyword tokens，避免每条记录重复 tokenize
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 模糊匹配工具（与 miniprogram/utils/fuzzy.ts 保持一致）
 *  - 把关键词切成 token
 *  - 命中规则：完整包含 > 字符全包含（任意顺序）
 *  - 评分：exact > prefix > includes > 字符有序 > 字符全包含
 */
function tokenize(s) {
  if (!s) return [];
  const re = /([A-Za-z0-9]+)|([\u4e00-\u9fa5])|(.)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) tokens.push(m[1].toLowerCase());
    else if (m[2]) tokens.push(m[2]);
    else if (m[3]) tokens.push(m[3]);
  }
  return tokens;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAllTokensPresent(text, tokens) {
  for (const tk of tokens) {
    if (!text.includes(tk)) return false;
  }
  return true;
}

/**
 * 计算单字段评分（越高越相关）
 *  - 完全相等：1000
 *  - 前缀匹配：500
 *  - 完整子串：200
 *  - token 全部按序出现：100
 *  - token 全出现（任意顺序）：30
 *  - 不匹配：0
 */
function fuzzyScore(text, keyword, kwTokens) {
  if (!text) return 0;
  const t = String(text).toLowerCase();
  if (!keyword) return 0;
  if (t === keyword) return 1000;
  if (t.startsWith(keyword)) return 500;
  if (t.includes(keyword)) return 200;
  if (!kwTokens || kwTokens.length === 0) return 0;
  // token 按序出现？
  let cursor = 0;
  for (const tk of kwTokens) {
    const idx = t.indexOf(tk, cursor);
    if (idx === -1) {
      return isAllTokensPresent(t, kwTokens) ? 30 : 0;
    }
    cursor = idx + tk.length;
  }
  return 100;
}

/**
 * 给 DB RegExp 一个宽松的"任一 token 命中"pattern，扩大候选集
 *  - 单 token：直接匹配
 *  - 多 token：合并为 (tok1|tok2|...)，让 DB 端能拉出包含任一字符的记录
 */
function buildLoosePattern(tokens) {
  if (tokens.length === 0) return null;
  const escaped = tokens.map(escapeRegExp);
  return escaped.length === 1 ? escaped[0] : escaped.join('|');
}

/**
 * 判断某条动画是否包含指定 tag
 *  - tag 可能是逗号分隔字符串，也可能是数组（兼容历史数据）
 */
function hasTag(tag, target) {
  if (!tag || !target) return false;
  if (Array.isArray(tag)) {
    return tag.some((t) => String(t).trim() === target);
  }
  return String(tag)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .includes(target);
}

exports.main = async (event /*, context*/) => {
  const { page = 0, pageSize = 20 } = event;
  const category = String(event.category || '').trim();

  if (!event.keyword || !String(event.keyword).trim()) {
    return { data: [], total: 0 };
  }

  const kw = String(event.keyword).trim();
  const kwTokens = tokenize(kw);
  const kwLower = kw.toLowerCase();
  const pattern = buildLoosePattern(kwTokens);
  if (!pattern) return { data: [], total: 0 };

  try {
    // 1. DB 端用宽松 RegExp 拉候选集（上限 200，避免一次性拉太多）
    const res = await db
      .collection('animations')
      .where(
        _.or([
          { title: db.RegExp({ regexp: pattern, options: 'i' }) },
          { up_name: db.RegExp({ regexp: pattern, options: 'i' }) },
          { tag: db.RegExp({ regexp: pattern, options: 'i' }) },
        ]),
      )
      .orderBy('publish_time', 'desc')
      .limit(200)
      .get();

    let list = res.data || [];

    // 1.5 分类筛选（在打分前先按 category 收窄，减少计算量）
    if (category) {
      list = list.filter((it) => hasTag(it.tag, category));
    }

    // 2+3. 合并匹配判定与评分到单次遍历
    //  原代码先 filter(fuzzyMatch) 再 map(fuzzyScore)，每条记录 tokenize 两次
    //  现在只 tokenize 一次：score > 0 即匹配
    const scored = [];
    for (const it of list) {
      const titleScore = fuzzyScore(it.title, kwLower, kwTokens);
      const upScore = fuzzyScore(it.up_name, kwLower, kwTokens);
      const tagScore = Array.isArray(it.tag)
        ? it.tag.reduce((max, tg) => {
            const s = fuzzyScore(String(tg), kwLower, kwTokens);
            return s > max ? s : max;
          }, 0)
        : 0;
      const score = Math.max(titleScore * 2, upScore, tagScore);
      if (score > 0) {
        scored.push({ it, score });
      }
    }

    // 按评分降序
    scored.sort((a, b) => b.score - a.score);

    const total = scored.length;
    const skip = page * pageSize;
    const paged = scored.slice(skip, skip + pageSize).map((x) => x.it);

    return { data: paged, total, page, pageSize };
  } catch (err) {
    console.error('[search] 失败', err);
    return { data: [], total: 0, error: err.message };
  }
};
