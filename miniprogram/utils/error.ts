import Taro from '@tarojs/taro';

/**
 * 统一错误处理工具
 * 消除各页面中重复的 `console.error + Taro.showToast` 模式
 */

/** 从任意错误对象中提取可读消息 */
export function getErrMsg(err: unknown, fallback = '操作失败'): string {
  if (err == null) return fallback;
  if (err instanceof Error) return err.message || fallback;
  const any = err as any;
  return any?.errMsg || any?.message || String(err) || fallback;
}

/**
 * 统一错误处理：console.error + Taro.showToast
 * @param tag    日志标签，如 '[Index]'
 * @param err    捕获到的错误
 * @param toast  toast 文案（默认 '加载失败'）
 */
export function toastError(tag: string, err: unknown, toast = '加载失败'): void {
  console.error(tag, err);
  Taro.showToast({ title: toast, icon: 'none' });
}

/**
 * 统一错误处理：console.error + Taro.showToast，toast 文案取错误自身消息
 * 适用于 submit / toggle 等操作类失败，文案随上下文变化
 */
export function toastOpError(tag: string, err: unknown, fallback = '操作失败'): void {
  console.error(tag, err);
  Taro.showToast({ title: getErrMsg(err, fallback), icon: 'none' });
}
