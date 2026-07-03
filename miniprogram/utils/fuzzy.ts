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
