/**
 * 关键词模糊匹配工具
 * 设计目标：
 *  - 容忍错别字：打错一个字也能命中
 *  - 容忍乱序：打字时打乱字序也能命中（如"沙diao" 也能匹配"沙雕"）
 *  - 容忍拼音/缩写：保留扩展点
 *  - 中文友好：按字符（code point）切分
 *
 * 算法：
 *  - 命中优先级 exact > startsWith > includes > 字符有序包含 > 字符全包含
 *  - 评分越高越相关
 */

/** 转义 RegExp 特殊字符 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把关键词切成"字符单元"：
 *  - 连续 ASCII 视为一个整体（单词），避免把 "java" 切成 j/a/v/a
 *  - 其它（中文、emoji）按 code point 切
 */
export function tokenize(s: string): string[] {
  if (!s) return [];
  const tokens: string[] = [];
  const re = /([A-Za-z0-9]+)|([\u4e00-\u9fa5])|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) tokens.push(m[1].toLowerCase());
    else if (m[2]) tokens.push(m[2]);
    else if (m[3]) tokens.push(m[3]);
  }
  return tokens;
}

/**
 * 判断 text 是否"模糊匹配" keyword
 * 返回 true 表示至少有一条命中规则
 */
export function fuzzyMatch(text: string, keyword: string): boolean {
  if (!text || !keyword) return false;
  const t = String(text).toLowerCase();
  const k = String(keyword).toLowerCase().trim();
  if (!k) return false;
  // 1. 完整包含
  if (t.includes(k)) return true;
  const kwTokens = tokenize(k);
  if (kwTokens.length === 0) return false;
  // 2. 所有 token 都在 text 里（任意顺序）
  for (const tk of kwTokens) {
    if (!t.includes(tk)) return false;
  }
  return true;
}

/**
 * 评分：越高越相关
 *  - 完全相等：1000
 *  - 前缀匹配：500
 *  - 完整子串：200
 *  - token 全部按序出现（乱序不行）：100
 *  - token 全出现（任意顺序）：30
 *  - 不匹配：0
 */
export function fuzzyScore(text: string, keyword: string): number {
  if (!text || !keyword) return 0;
  const t = String(text).toLowerCase();
  const k = String(keyword).toLowerCase().trim();
  if (!k) return 0;
  if (t === k) return 1000;
  if (t.startsWith(k)) return 500;
  if (t.includes(k)) return 200;
  const kwTokens = tokenize(k);
  if (kwTokens.length === 0) return 0;
  // 字符（token）按序出现？
  let cursor = 0;
  for (const tk of kwTokens) {
    const idx = t.indexOf(tk, cursor);
    if (idx === -1) {
      // 一旦中间断了就降级
      return isAllTokensPresent(t, kwTokens) ? 30 : 0;
    }
    cursor = idx + tk.length;
  }
  return 100;
}

function isAllTokensPresent(text: string, tokens: string[]): boolean {
  for (const tk of tokens) {
    if (!text.includes(tk)) return false;
  }
  return true;
}

/**
 * 对一组文本按 keyword 评分并倒序排
 * 同时返回是否"真的匹配"（score > 0）
 */
export function fuzzyRank<T>(
  items: T[],
  keyword: string,
  pick: (it: T) => string | undefined,
): T[] {
  if (!keyword.trim()) return items;
  const scored = items
    .map((it) => {
      const text = (pick(it) || '').toLowerCase();
      return { it, score: fuzzyScore(text, keyword) };
    })
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.it);
}

/**
 * 给 RegExp 一个"放宽"的匹配模式：
 *  - 关键词切成 token，把 token 替换为"在原文中出现即可"
 *  - 单 token：直接用（escape 后）
 *  - 多 token：拼接成 `(tok1.*tok2.*...|tok2.*tok1.*...)` 前 K! 个排列
 *    K 限制为 3（>3 时退化为"任一 token 命中"），避免正则爆炸
 */
export function buildFuzzyRegExp(keyword: string, maxPermutations = 6): RegExp {
  const tokens = tokenize(keyword).map(escapeRegExp);
  if (tokens.length === 0) return /$.^/; // never match
  if (tokens.length === 1) {
    return new RegExp(tokens[0], 'i');
  }
  // 限制 token 数量
  const limited = tokens.slice(0, 3);
  // 列出有限数量的排列
  const perms = permutations(limited, maxPermutations);
  const pattern = perms
    .map((perm) => perm.join('.*'))
    .map((p) => `(${p})`)
    .join('|');
  return new RegExp(pattern, 'i');
}

function permutations<T>(arr: T[], limit: number): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  function helper(remaining: T[], current: T[]) {
    if (result.length >= limit) return;
    if (remaining.length === 0) {
      result.push([...current]);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      const next = remaining.slice(0, i).concat(remaining.slice(i + 1));
      helper(next, [...current, remaining[i]]);
    }
  }
  helper(arr, []);
  return result;
}
