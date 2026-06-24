import Taro from '@tarojs/taro';

const CLOUD_ENV = 'cloud1-d0gk61vsuefecd8cf';

// 微信云函数默认超时 10s，业务上经常不够（DB 聚合、跨函数调用、外部 HTTP）
// 显式延长到 30s；需要更长时由调用方临时覆盖
const DEFAULT_TIMEOUT_MS = 30_000;

function genCallId() {
  return `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 云开发封装 —— 仅提供 callFunction 入口
 *
 * 原则：**所有 DB 读写全部走云函数，云函数内部操作数据库**。
 * 业务侧如需数据，统一通过 CloudService.callFunction('xxx', payload) 走云函数。
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

  /**
   * 调用云函数并返回 result（已校验 success）
   * 适用于"写/操作"类调用：失败时抛出带 error 信息的 Error。
   *   const r = await CloudService.callCloud('rating', { action: 'submit', ... });
   *   return { newRating: !!r.newRating };
   */
  async callCloud(
    name: string,
    data?: Record<string, any>,
    options?: { timeoutMs?: number },
  ): Promise<Record<string, any>> {
    const res = await this.callFunction(name, data, options);
    const result = (res as any)?.result;
    if (!result || result.success === false) {
      throw new Error(result?.error || `${name} 调用失败`);
    }
    return result;
  }

  /**
   * 调用云函数，成功返回 result，失败/异常返回 null（不抛错）
   * 适用于"读/查询"类调用：失败时降级返回空，由调用方兜底。
   *   const r = await CloudService.callCloudSafe('getAnimationById', { id });
   *   return r?.data ?? null;
   */
  async callCloudSafe(
    name: string,
    data?: Record<string, any>,
    options?: { timeoutMs?: number },
  ): Promise<Record<string, any> | null> {
    try {
      const res = await this.callFunction(name, data, options);
      const result = (res as any)?.result;
      if (!result || result.success === false) {
        console.warn(`[Cloud] callCloudSafe ${name} business-fail`, result?.error);
        return null;
      }
      return result;
    } catch (err) {
      console.warn(`[Cloud] callCloudSafe ${name} failed`, err);
      return null;
    }
  }
}

export const CloudService = new CloudServiceImpl();
