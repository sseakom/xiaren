import Taro from '@tarojs/taro';

/**
 * 工具函数集合 - 迁移自原生小程序 utils/util.js
 * 同时兼容 Taro 跨端 API
 */

/** 数字格式化：1000 → 1k, 10000 → 1w */
export function formatNumber(n: number | string | undefined | null): string {
  const v = Number(n);
  if (n == null || isNaN(v) || v < 0) return '0';
  if (v < 1000) return String(Math.floor(v));
  if (v < 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (v < 100000000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
  return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
}

/** 格式化相对时间 */
export function formatTime(date: string | Date | undefined | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    const months = Math.floor(days / 30);
    return months + '个月前';
  }
  if (days > 0) return days + '天前';
  if (hours > 0) return hours + '小时前';
  if (minutes > 0) return minutes + '分钟前';
  return '刚刚';
}

/** 格式化时长
 *  支持两种输入：
 *  - 数字：原始秒数（如 125 → "02:05"，3725 → "1:02:05"）
 *  - 字符串：已是 mm:ss / hh:mm:ss 格式（如 "1670:39" → "27:50:39"）
 *  - 其他非法输入：返回 "--:--"
 *
 *  - < 1 小时：mm:ss（如 23:45、5:03）
 *  - >= 1 小时：hh:mm:ss（如 1:23:45、10:00:00）
 */
export function formatDuration(input: number | string | undefined | null): string {
  if (input == null) return '--:--';

  let total: number;

  if (typeof input === 'number') {
    total = input;
  } else {
    // 字符串：可能是 "1670:39" (mm:ss) / "1:23:45" (hh:mm:ss) / "285" (纯数字)
    const str = String(input).trim();
    if (!str) return '--:--';
    if (/^\d+(\.\d+)?$/.test(str)) {
      // 纯数字字符串 → 当成秒数
      total = Number(str);
    } else if (/^\d+(:\d+){1,2}$/.test(str)) {
      // mm:ss 或 hh:mm:ss
      const parts = str.split(':').map(Number);
      if (parts.length === 2) {
        const [m, s] = parts;
        total = m * 60 + s;
      } else {
        const [h, m, s] = parts;
        total = h * 3600 + m * 60 + s;
      }
    } else {
      return '--:--';
    }
  }

  if (isNaN(total) || total < 0) return '--:--';

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);

  const pad = (n: number) => String(n).padStart(2, '0');

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 评分转文字描述（10 分制） */
export function scoreToText(score: number): string {
  if (score >= 9) return '神作';
  if (score >= 8) return '优秀';
  if (score >= 7) return '良好';
  if (score >= 6) return '一般';
  if (score >= 5) return '及格';
  return '较差';
}

/** 评分转颜色（10 分制） */
export function scoreToColor(score: number): string {
  if (score >= 9) return '#E74C3C';
  if (score >= 8) return '#FF6B35';
  if (score >= 7) return '#F39C12';
  if (score >= 6) return '#27AE60';
  if (score >= 5) return '#3498DB';
  return '#95A5A6';
}

/** 防抖 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay = 300,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (this: unknown, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** 节流 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  delay = 300,
): (...args: Parameters<T>) => void {
  let last = 0;
  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/** 复制 B 站视频 bvid */
export function openBilibili(bvid: string): void {
  if (!bvid) {
    Taro.showToast({ title: '无效的视频ID', icon: 'none' });
    return;
  }
  Taro.setClipboardData({
    data: bvid,
    success: () => {
      Taro.showToast({ title: 'bvid 已复制', icon: 'none' });
    },
  });
}
