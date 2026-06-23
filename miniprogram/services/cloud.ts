import Taro from '@tarojs/taro';

const CLOUD_ENV = 'cloud1-d0gk61vsuefecd8cf';

// 微信云函数默认超时 10s，业务上经常不够（DB 聚合、跨函数调用、外部 HTTP）
// 显式延长到 30s；需要更长时由调用方临时覆盖
const DEFAULT_TIMEOUT_MS = 30_000;

function genCallId() {
  return `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 云开发封装
 * 提供 db 与 callFunction 的统一入口
 */
class CloudServiceImpl {
  private initialized = false;

  init() {
    if (this.initialized) return;
    if (typeof Taro.cloud === 'undefined') {
      console.error('[Cloud] 当前环境不支持云开发');
      return;
    }
    try {
      Taro.cloud.init({ env: CLOUD_ENV, traceUser: true });
      this.initialized = true;
      console.log('[Cloud] initialized, env:', CLOUD_ENV);
    } catch (err) {
      console.error('[Cloud] init failed', err);
    }
  }

  /** 数据库实例 */
  get db() {
    return Taro.cloud.database();
  }

  /** 数据库命令符 */
  get _() {
    return this.db.command;
  }

  /**
   * 带超时的 Promise 包装：避免微信 SDK 内部操作（如 db.get/set）卡死时
   * 整个 await 链 30s 不返回
   */
  async withTimeout<T>(
    promise: Promise<T>,
    label: string,
    timeoutMs = 8000,
  ): Promise<T> {
    let timer: any;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[Cloud] ${label} timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      return (await Promise.race([promise, timeout])) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 调用云函数
   * 1. 显式 config.timeout=30s，避免微信默认 10s 提前超时
   *    （Taro 类型未声明 IConfig.timeout，运行时是支持的；用 as any 透传）
   * 2. 计时 + 日志，便于定位耗时瓶颈
   * 3. 错误带上云函数名 + callId，方便排查
   */
  async callFunction(
    name: string,
    data?: Record<string, any>,
    options: { timeoutMs?: number } = {},
  ): Promise<Taro.cloud.CallFunctionResult> {
    if (!this.initialized) this.init();
    const callId = genCallId();
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    console.log(`[Cloud] ▶ ${name} ${callId} start`, data);
    try {
      // Taro 的 callFunction 类型是 (param: OQ<...>) => void | (param: RQ<...>) => Promise<...> 双重重载
      // 用 as unknown as Promise<...> 强制走 Promise 重载
      const res = (await (Taro.cloud.callFunction as any)({
        name,
        data,
        config: { timeout },
      })) as Taro.cloud.CallFunctionResult;
      const cost = Date.now() - started;
      // 透出 success/error 字段，方便区分业务失败与网络失败
      if ((res as any).result?.success === false) {
        console.warn(
          `[Cloud] ✖ ${name} ${callId} business-fail ${cost}ms`,
          (res as any).result,
        );
      } else {
        console.log(`[Cloud] ✓ ${name} ${callId} ok ${cost}ms`);
      }
      return res;
    } catch (err: any) {
      const cost = Date.now() - started;
      // 微信默认 10s 超时会返回 errMsg="timeout"，无法定位来源
      // 包装成业务可识别的错误
      const errMsg = err?.errMsg || err?.message || String(err);
      const wrapped = new Error(
        `[Cloud] callFunction "${name}" failed after ${cost}ms (${callId}): ${errMsg}`,
      );
      (wrapped as any).origin = err;
      (wrapped as any).callId = callId;
      (wrapped as any).name = name;
      (wrapped as any).cost = cost;
      console.error(`[Cloud] ✖ ${name} ${callId} err ${cost}ms`, err);
      throw wrapped;
    }
  }
}

export const CloudService = new CloudServiceImpl();
