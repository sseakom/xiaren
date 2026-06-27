import Taro from '@tarojs/taro';
import { RequestCacheService, buildCloudCacheKey } from './requestCache';

const CLOUD_ENV = 'cloud1-d0gk61vsuefecd8cf';

// 微信云函数默认超时 10s，业务上经常不够（DB 聚合、跨函数调用、外部 HTTP）
// 显式延长到 30s；需要更长时由调用方临时覆盖
const DEFAULT_TIMEOUT_MS = 30_000;

type CloudFunctionData = Record<string, any> | undefined;
type CacheMode = 'read' | 'write' | 'never';
type CloudFunctionResultData = Record<string, any> | undefined;

interface CloudRequestPolicy {
  mode: CacheMode;
  ttlMs?: number;
  userScoped?: boolean;
}

function genCallId() {
  return `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeTagValue(value: any) {
  return String(value || '').trim();
}

function getCurrentUserScopeToken() {
  const openid = Taro.getStorageSync('user_openid_cache') as string | undefined;
  return openid ? `user:${openid}` : 'guest';
}

function makeScopedTag(base: string, scopeToken = getCurrentUserScopeToken()) {
  return `${base}@${scopeToken}`;
}

function collectAnimationTags(items: any[] = []) {
  const tags: string[] = [];
  items.forEach((item) => {
    const bvid = normalizeTagValue(item?.bvid || item?.animation_bvid || item?.animBvid);
    if (bvid) {
      tags.push(`animation:${bvid}`);
    }
  });
  return tags;
}

function buildCacheTags(
  name: string,
  data: CloudFunctionData,
  result: CloudFunctionResultData,
  userScoped: boolean,
): string[] {
  const tags = [`fn:${name}`];
  const scopeToken = userScoped ? getCurrentUserScopeToken() : '';
  const pushScoped = (base: string) => {
    tags.push(userScoped ? makeScopedTag(base, scopeToken) : base);
  };

  switch (name) {
    case 'listAnimations':
      pushScoped('animations:list');
      tags.push(...collectAnimationTags(Array.isArray(result?.data) ? result?.data : []));
      break;
    case 'getAnimationById': {
      const id = normalizeTagValue(data?.bvid || result?.data?.bvid);
      pushScoped('animations:detail');
      if (id) {
        tags.push(`animation:${id}`);
      }
      break;
    }
    case 'search':
      pushScoped('animations:search');
      tags.push(...collectAnimationTags(Array.isArray(result?.data) ? result?.data : []));
      break;
    case 'calcScore': {
      const id = normalizeTagValue(data?.animation_bvid);
      if (id) {
        tags.push(`animation:${id}:score`);
        tags.push(`animation:${id}`);
      }
      break;
    }
    case 'bilibiliFetch': {
      const bvid = normalizeTagValue(data?.bvid || result?.data?.bvid);
      pushScoped('bilibili:meta');
      if (bvid) {
        tags.push(`bilibili:${bvid.toLowerCase()}`);
      }
      break;
    }
    case 'rating': {
      pushScoped('user:ratings');
      if (data?.action === 'get') {
        const id = normalizeTagValue(data?.animation_bvid);
        if (id) {
          tags.push(makeScopedTag(`animation:${id}:rating`, scopeToken));
          tags.push(`animation:${id}`);
        }
      }
      if (data?.action === 'listMy') {
        tags.push(...collectAnimationTags(Array.isArray(result?.data) ? result?.data : []));
      }
      break;
    }
    case 'collection': {
      pushScoped('user:collections');
      if (data?.action === 'listMy') {
        const type = normalizeTagValue(data?.type);
        if (type) {
          pushScoped(`user:collections:${type}`);
        }
        tags.push(...collectAnimationTags(Array.isArray(result?.data) ? result?.data : []));
      }
      if (data?.action === 'getStatus') {
        const id = normalizeTagValue(data?.animation_bvid);
        if (id) {
          tags.push(makeScopedTag(`animation:${id}:collection`, scopeToken));
          tags.push(`animation:${id}`);
        }
      }
      break;
    }
    case 'userService':
      if (data?.action === 'getInfo') {
        pushScoped('user:profile');
      }
      if (data?.action === 'loadStats') {
        pushScoped('user:stats');
      }
      break;
    case 'animationSubmit':
      if (data?.action === 'checkBvidUnique') {
        const bvid = normalizeTagValue(data?.bvid);
        pushScoped('submission:bvid');
        if (bvid) {
          tags.push(`submission:bvid:${bvid.toLowerCase()}`);
        }
      }
      break;
    case 'animationMySubmissions':
      pushScoped('user:submissions');
      break;
    case 'animationReview':
      if (data?.action === 'list') {
        tags.push('review:list');
        if (Array.isArray(result?.data)) {
          result.data.forEach((item: any) => {
            const id = normalizeTagValue(item?._id);
            if (id) tags.push(`review:item:${id}`);
          });
        }
      }
      if (data?.action === 'get') {
        const id = normalizeTagValue(data?._id || result?.data?._id);
        if (id) {
          tags.push(`review:item:${id}`);
        }
      }
      break;
    default:
      break;
  }

  return [...new Set(tags.filter(Boolean))];
}

function buildInvalidationTags(
  name: string,
  data: CloudFunctionData,
  result: CloudFunctionResultData,
): string[] {
  const tags = [`fn:${name}`];
  const currentScope = getCurrentUserScopeToken();
  const currentScoped = (base: string) => makeScopedTag(base, currentScope);

  switch (name) {
    case 'rating': {
      if (data?.action !== 'submit') break;
      const id = normalizeTagValue(data?.animation_bvid);
      tags.push(currentScoped('user:ratings'));
      tags.push(currentScoped('user:stats'));
      if (id) {
        tags.push(currentScoped(`animation:${id}:rating`));
        tags.push(`animation:${id}:score`);
      }
      break;
    }
    case 'collection': {
      if (data?.action !== 'toggle') break;
      const id = normalizeTagValue(data?.animation_bvid);
      const type = normalizeTagValue(data?.type);
      tags.push(currentScoped('user:collections'));
      tags.push(currentScoped('user:stats'));
      if (type) {
        tags.push(currentScoped(`user:collections:${type}`));
      }
      if (id) {
        tags.push(currentScoped(`animation:${id}:collection`));
      }
      break;
    }
    case 'userService': {
      if (data?.action === 'upsert' || data?.action === 'updateProfile') {
        tags.push(currentScoped('user:profile'));
      }
      if (data?.action === 'upsert') {
        tags.push(currentScoped('user:stats'));
      }
      break;
    }
    case 'animationSubmit': {
      tags.push(currentScoped('user:submissions'));
      if (data?.action === 'cancel') {
        const submissionId = normalizeTagValue(data?._id || result?.data?._id);
        tags.push('review:list');
        if (submissionId) {
          tags.push(`review:item:${submissionId}`);
        }
        break;
      }
      if (data?.type === 'create') {
        const bvid = normalizeTagValue(data?.payload?.bvid);
        tags.push('review:list');
        tags.push(currentScoped('submission:bvid'));
        if (bvid) {
          tags.push(`submission:bvid:${bvid.toLowerCase()}`);
        }
      }
      if (data?.type === 'correction' || data?.type === 'correction_delete') {
        tags.push('review:list');
      }
      break;
    }
    case 'animationReview': {
      const meta = result?.data || {};
      const submissionId = normalizeTagValue(data?._id || meta?.submissionId);
      const targetBvid = normalizeTagValue(meta?.targetBvid);
      const bvid = normalizeTagValue(meta?.bvid);
      const submitterOpenid = normalizeTagValue(meta?.submitterOpenid);
      const submitterScope = submitterOpenid ? `user:${submitterOpenid}` : '';
      tags.push('review:list');
      if (submissionId) {
        tags.push(`review:item:${submissionId}`);
      }
      if (submitterScope) {
        tags.push(makeScopedTag('user:submissions', submitterScope));
      }
      if (data?.action !== 'approve') {
        break;
      }
      if (meta?.type === 'create') {
        tags.push('animations:list', 'animations:search');
        if (bvid) {
          tags.push(`submission:bvid:${bvid.toLowerCase()}`);
        }
      }
      if (meta?.type === 'correction') {
        tags.push('animations:list', 'animations:search');
        if (targetBvid) {
          tags.push(`animation:${targetBvid}`);
        }
      }
      if (meta?.type === 'correction_delete') {
        tags.push('animations:list', 'animations:search');
        if (targetBvid) {
          tags.push(`animation:${targetBvid}`);
          tags.push(`animation:${targetBvid}:score`);
        }
      }
      break;
    }
    default:
      break;
  }

  return [...new Set(tags.filter(Boolean))];
}

function getCloudRequestPolicy(name: string, data?: CloudFunctionData): CloudRequestPolicy {
  const action = typeof data?.action === 'string' ? data.action : '';
  switch (name) {
    case 'listAnimations':
      return { mode: 'read', ttlMs: 3 * 60 * 1000 };
    case 'getAnimationById':
      return { mode: 'read', ttlMs: 10 * 60 * 1000 };
    case 'search':
      return { mode: 'read', ttlMs: 2 * 60 * 1000 };
    case 'calcScore':
      return { mode: 'read', ttlMs: 3 * 60 * 1000 };
    case 'bilibiliFetch':
      return { mode: 'read', ttlMs: 10 * 60 * 1000 };
    case 'rating':
      if (action === 'get' || action === 'listMy') {
        return {
          mode: 'read',
          ttlMs: 60 * 1000,
          userScoped: true,
        };
      }
      return { mode: 'write' };
    case 'collection':
      if (action === 'getStatus' || action === 'listMy') {
        return {
          mode: 'read',
          ttlMs: 60 * 1000,
          userScoped: true,
        };
      }
      return { mode: 'write' };
    case 'userService':
      if (action === 'getInfo') {
        return {
          mode: 'read',
          ttlMs: 5 * 60 * 1000,
          userScoped: true,
        };
      }
      if (action === 'loadStats') {
        return {
          mode: 'read',
          ttlMs: 60 * 1000,
          userScoped: true,
        };
      }
      return { mode: 'write' };
    case 'animationSubmit':
      if (action === 'checkBvidUnique') {
        return { mode: 'read', ttlMs: 2 * 60 * 1000, userScoped: false };
      }
      return { mode: 'write' };
    case 'animationMySubmissions':
      return {
        mode: 'read',
        ttlMs: 60 * 1000,
        userScoped: true,
      };
    case 'animationReview':
      if (action === 'list' || action === 'get') {
        return {
          mode: 'read',
          ttlMs: 60 * 1000,
          userScoped: false,
        };
      }
      return { mode: 'write' };
    default:
      return { mode: 'never' };
  }
}

function isValidCacheableResult(result: any) {
  if (!result || typeof result !== 'object') return false;
  if (result.success === false) return false;
  if (typeof result.error === 'string' && result.error.trim()) return false;
  return true;
}

/**
 * 云开发封装 —— 仅提供 callFunction 入口
 *
 * 原则：**所有 DB 读写全部走云函数，云函数内部操作数据库**。
 * 业务侧如需数据，统一通过 CloudService.callFunction('xxx', payload) 走云函数。
 */
class CloudServiceImpl {
  private initialized = false;
  private inFlightRequests = new Map<string, Promise<Taro.cloud.CallFunctionResult>>();

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
    data?: CloudFunctionData,
    options: { timeoutMs?: number } = {},
  ): Promise<Taro.cloud.CallFunctionResult> {
    if (!this.initialized) this.init();
    const policy = getCloudRequestPolicy(name, data);
    const cacheKey =
      policy.mode === 'read' ? buildCloudCacheKey(name, data, !!policy.userScoped) : '';
    if (cacheKey) {
      const cached = RequestCacheService.get<Taro.cloud.CallFunctionResult>(cacheKey);
      if (cached) {
        console.log(`[Cloud] ↺ ${name} cache-hit`);
        return cached;
      }
      const pending = this.inFlightRequests.get(cacheKey);
      if (pending) {
        console.log(`[Cloud] ↻ ${name} reuse in-flight request`);
        return pending;
      }
    }

    const callId = genCallId();
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    console.log(`[Cloud] ▶ ${name} ${callId} start`, data);
    const execute = async () => {
      try {
        // Taro 的 callFunction 类型是 (param: OQ<...>) => void | (param: RQ<...>) => Promise<...> 双重重载
        // 用 as unknown as Promise<...> 强制走 Promise 重载
        const res = (await (Taro.cloud.callFunction as any)({
          name,
          data,
          config: { timeout },
        })) as Taro.cloud.CallFunctionResult;
        const cost = Date.now() - started;
        const result = (res as any)?.result;
        // 透出 success/error 字段，方便区分业务失败与网络失败
        if (result?.success === false) {
          console.warn(`[Cloud] ✖ ${name} ${callId} business-fail ${cost}ms`, result);
        } else {
          console.log(`[Cloud] ✓ ${name} ${callId} ok ${cost}ms`);
          if (cacheKey && policy.ttlMs && isValidCacheableResult(result)) {
            const cacheTags = buildCacheTags(name, data, result, !!policy.userScoped);
            RequestCacheService.set(cacheKey, res, policy.ttlMs, cacheTags);
          }
          if (policy.mode === 'write' && isValidCacheableResult(result)) {
            const invalidationTags = buildInvalidationTags(name, data, result);
            const cleared = RequestCacheService.invalidateByTags(invalidationTags);
            if (cleared > 0) {
              console.log(`[Cloud] ♻ invalidated request cache after write: ${name}`, {
                cleared,
                tags: invalidationTags,
              });
            }
          }
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
      } finally {
        if (cacheKey) {
          this.inFlightRequests.delete(cacheKey);
        }
      }
    };

    const requestPromise = execute();
    if (cacheKey) {
      this.inFlightRequests.set(cacheKey, requestPromise);
    }
    return requestPromise;
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
