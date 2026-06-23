// cloudfunctions/search/index.js
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

function fuzzyMatch(text, keyword) {
  if (!text || !keyword) return false;
  const t = String(text).toLowerCase();
  const k = String(keyword).toLowerCase().trim();
  if (!k) return false;
  if (t.includes(k)) return true;
  const kwTokens = tokenize(k);
  if (kwTokens.length === 0) return false;
  return isAllTokensPresent(t, kwTokens);
}

function fuzzyScore(text, keyword) {
  if (!text || !keyword) return 0;
  const t = String(text).toLowerCase();
  const k = String(keyword).toLowerCase().trim();
  if (!k) return 0;
  if (t === k) return 1000;
  if (t.startsWith(k)) return 500;
  if (t.includes(k)) return 200;
  const kwTokens = tokenize(k);
  if (kwTokens.length === 0) return 0;
  let cursor = 0;
  for (const tk of kwTokens) {
    const idx = t.indexOf(tk, cursor);
    if (idx === -1) return isAllTokensPresent(t, kwTokens) ? 30 : 0;
    cursor = idx + tk.length;
  }
  return 100;
}

/**
 * 给 DB RegExp 一个宽松的"任一 token 命中"pattern，扩大候选集
 *  - 单 token：直接匹配
 *  - 多 token：合并为 (tok1|tok2|...)，让 DB 端能拉出包含任一字符的记录
 */
function buildLoosePattern(keyword) {
  const tokens = tokenize(keyword).map(escapeRegExp);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return tokens[0];
  return tokens.join('|');
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

exports.main = async (event, context) => {
  const { keyword, page = 0, pageSize = 20 } = event;
  const category = String(event.category || '').trim();

  if (!keyword || !String(keyword).trim()) {
    return { data: [], total: 0 };
  }

  const kw = String(keyword).trim();
  const pattern = buildLoosePattern(kw);
  if (!pattern) return { data: [], total: 0 };

  try {
    // 1. DB 端用宽松 RegExp 拉候选集（上限 200，避免一次性拉太多）
    const res = await db.collection('animations')
      .where(_.or([
        { title: db.RegExp({ regexp: pattern, options: 'i' }) },
        { up_name: db.RegExp({ regexp: pattern, options: 'i' }) },
        { tag: db.RegExp({ regexp: pattern, options: 'i' }) },
      ]))
      .orderBy('publish_time', 'desc')
      .limit(200)
      .get();

    let list = res.data || [];

    // 1.5 分类筛选（在模糊匹配前先按 category 收窄，避免无谓打分）
    if (category) {
      list = list.filter((it) => hasTag(it.tag, category));
    }

    // 2. JS 端过滤（去掉"碰巧命中 pattern 但并不真模糊匹配"的噪声）
    const matched = list.filter(
      (it) => fuzzyMatch(it.title, kw) || fuzzyMatch(it.up_name, kw) || (Array.isArray(it.tag) && it.tag.some((tg) => fuzzyMatch(tg, kw)))
    );

    // 3. JS 端排序：title 优先，其次 up_name，最后 tag
    const scored = matched.map((it) => {
      const titleScore = fuzzyScore(it.title || '', kw);
      const upScore = fuzzyScore(it.up_name || '', kw);
      const tagcore = Array.isArray(it.tag)
        ? Math.max(...it.tag.map((tg) => fuzzyScore(String(tg), kw)))
        : 0;
      return { it, score: Math.max(titleScore * 2, upScore, tagcore) };
    }).filter((x) => x.score > 0);

    scored.sort((a, b) => b.score - a.score);

    const total = scored.length;
    const skip = page * pageSize;
    const paged = scored.slice(skip, skip + pageSize).map((x) => x.it);

    return {
      data: paged,
      total,
      page,
      pageSize,
    };
  } catch (err) {
    console.error('[search] 失败', err);
    return {
      data: [],
      total: 0,
      error: err.message,
    };
  }
};
