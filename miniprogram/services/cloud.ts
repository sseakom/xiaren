import Taro from '@tarojs/taro';
import { RequestCacheService, buildCloudCacheKey } from './requestCache';

const CLOUD_ENV = 'cloud1-d0gk61vsuefecd8cf';
const OPENID_CACHE_KEY = 'user_openid_cache';

// 微信云函数默认超时 10s，业务上经常不够（DB 聚合、跨函数调用、外部 HTTP）
// 显式延长到 30s；需要更长时由调用方临时覆盖
const DEFAULT_TIMEOUT_MS = 30_000;

type CloudFunctionData = Record<string, any> | undefined;
type CacheMode = 'read' | 'write' | 'never';
type CloudFunctionResultData = Record<string, any> | undefined;
type CloudFunctionOptions = { timeoutMs?: number };

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
  const openid = Taro.getStorageSync(OPENID_CACHE_KEY) as string | undefined;
  return openid ? `user:${openid}` : 'guest';
}

function makeScopedTag(base: string, scopeToken = getCurrentUserScopeToken()) {
  return `${base}@${scopeToken}`;
}

function appendScopedTag(tags: string[], base: string, userScoped: boolean, scopeToken: string) {
  tags.push(userScoped ? makeScopedTag(base, scopeToken) : base);
}

function appendAnimationTag(tags: string[], value: any) {
  const bvid = normalizeTagValue(value);
  if (bvid) {
    tags.push(`animation:${bvid}`);
  }
}

function appendLowercaseTag(tags: string[], prefix: string, value: any) {
  const normalized = normalizeTagValue(value);
  if (normalized) {
    tags.push(`${prefix}:${normalized.toLowerCase()}`);
  }
}

function collectAnimationTags(items: any[] = []) {
  const tags: string[] = [];
  items.forEach((item) => {
    appendAnimationTag(tags, item?.bvid || item?.animation_bvid || item?.animBvid);
  });
  return tags;
}

function collectResultAnimationTags(result: CloudFunctionResultData) {
  return collectAnimationTags(Array.isArray(result?.data) ? result.data : []);
}

function collectReviewItemTags(result: CloudFunctionResultData) {
  const tags: string[] = [];
  if (Array.isArray(result?.data)) {
    result.data.forEach((item: any) => {
      const id = normalizeTagValue(item?._id);
      if (id) {
        tags.push(`review:item:${id}`);
      }
    });
  }
  return tags;
}

function finalizeTags(tags: string[]) {
  return [...new Set(tags.filter(Boolean))];
}

function getAction(data?: CloudFunctionData) {
  return typeof data?.action === 'string' ? data.action : '';
}

function buildReadPolicy(ttlMs: number, userScoped = false): CloudRequestPolicy {
  return { mode: 'read', ttlMs, userScoped };
}

function getCloudResult(res: Taro.cloud.CallFunctionResult) {
  return (res as any)?.result as CloudFunctionResultData;
}

function buildCallError(name: string, callId: string, cost: number, err: any) {
  const errMsg = err?.errMsg || err?.message || String(err);
  const wrapped = new Error(`[Cloud] callFunction "${name}" failed after ${cost}ms (${callId}): ${errMsg}`);
  (wrapped as any).origin = err;
  (wrapped as any).callId = callId;
  (wrapped as any).name = name;
  (wrapped as any).cost = cost;
  return wrapped;
}

function buildCacheTags(
  name: string,
  data: CloudFunctionData,
  result: CloudFunctionResultData,
  userScoped: boolean,
): string[] {
  const tags = [`fn:${name}`];
  const scopeToken = userScoped ? getCurrentUserScopeToken() : '';

  switch (name) {
    case 'listAnimations':
      appendScopedTag(tags, 'animations:list', userScoped, scopeToken);
      tags.push(...collectResultAnimationTags(result));
      break;
    case 'getAnimationById': {
      const id = normalizeTagValue(data?.bvid || result?.data?.bvid);
      appendScopedTag(tags, 'animations:detail', userScoped, scopeToken);
      appendAnimationTag(tags, id);
      break;
    }
    case 'search':
      appendScopedTag(tags, 'animations:search', userScoped, scopeToken);
      tags.push(...collectResultAnimationTags(result));
      break;
    case 'calcScore': {
      const id = normalizeTagValue(data?.animation_bvid);
      if (id) {
        tags.push(`animation:${id}:score`);
        appendAnimationTag(tags, id);
      }
      break;
    }
    case 'bilibiliFetch': {
      const bvid = normalizeTagValue(data?.bvid || result?.data?.bvid);
      appendScopedTag(tags, 'bilibili:meta', userScoped, scopeToken);
      appendLowercaseTag(tags, 'bilibili', bvid);
      break;
    }
    case 'rating': {
      appendScopedTag(tags, 'user:ratings', userScoped, scopeToken);
      if (data?.action === 'get') {
        const id = normalizeTagValue(data?.animation_bvid);
        if (id) {
          tags.push(makeScopedTag(`animation:${id}:rating`, scopeToken));
          appendAnimationTag(tags, id);
        }
      }
      if (data?.action === 'listMy') {
        tags.push(...collectResultAnimationTags(result));
      }
      break;
    }
    case 'collection': {
      appendScopedTag(tags, 'user:collections', userScoped, scopeToken);
      if (data?.action === 'listMy') {
        const type = normalizeTagValue(data?.type);
        if (type) {
          appendScopedTag(tags, `user:collections:${type}`, userScoped, scopeToken);
        }
        tags.push(...collectResultAnimationTags(result));
      }
      if (data?.action === 'getStatus') {
        const id = normalizeTagValue(data?.animation_bvid);
        if (id) {
          tags.push(makeScopedTag(`animation:${id}:collection`, scopeToken));
          appendAnimationTag(tags, id);
        }
      }
      break;
    }
    case 'userService':
      if (data?.action === 'getInfo') {
        appendScopedTag(tags, 'user:profile', userScoped, scopeToken);
      }
      if (data?.action === 'loadStats') {
        appendScopedTag(tags, 'user:stats', userScoped, scopeToken);
      }
      break;
    case 'animationSubmit':
      if (data?.action === 'checkBvidUnique') {
        appendScopedTag(tags, 'submission:bvid', userScoped, scopeToken);
        appendLowercaseTag(tags, 'submission:bvid', data?.bvid);
      }
      break;
    case 'animationMySubmissions':
      appendScopedTag(tags, 'user:submissions', userScoped, scopeToken);
      break;
    case 'animationReview':
      if (data?.action === 'list') {
        tags.push('review:list');
        tags.push(...collectReviewItemTags(result));
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
        tags.push('review:list');
        tags.push(currentScoped('submission:bvid'));
        appendLowercaseTag(tags, 'submission:bvid', data?.payload?.bvid);
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
        appendLowercaseTag(tags, 'submission:bvid', bvid);
      }
      if (meta?.type === 'correction') {
        tags.push('animations:list', 'animations:search');
        if (targetBvid) {
          appendAnimationTag(tags, targetBvid);
        }
      }
      if (meta?.type === 'correction_delete') {
        tags.push('animations:list', 'animations:search');
        if (targetBvid) {
          appendAnimationTag(tags, targetBvid);
          tags.push(`animation:${targetBvid}:score`);
        }
      }
      break;
    }
    default:
      break;
  }

  return finalizeTags(tags);
}

function getCloudRequestPolicy(name: string, data?: CloudFunctionData): CloudRequestPolicy {
  const action = getAction(data);
  switch (name) {
    case 'listAnimations':
      return buildReadPolicy(3 * 60 * 1000);
    case 'getAnimationById':
      return buildReadPolicy(10 * 60 * 1000);
    case 'search':
      return buildReadPolicy(2 * 60 * 1000);
    case 'calcScore':
      return buildReadPolicy(3 * 60 * 1000);
    case 'bilibiliFetch':
      return buildReadPolicy(10 * 60 * 1000);
    case 'rating':
      if (action === 'get' || action === 'listMy') {
        return buildReadPolicy(60 * 1000, true);
      }
      return { mode: 'write' };
    case 'collection':
      if (action === 'getStatus' || action === 'listMy') {
        return buildReadPolicy(60 * 1000, true);
      }
      return { mode: 'write' };
    case 'userService':
      if (action === 'getInfo') {
        return buildReadPolicy(5 * 60 * 1000, true);
      }
      if (action === 'loadStats') {
        return buildReadPolicy(60 * 1000, true);
      }
      return { mode: 'write' };
    case 'animationSubmit':
      if (action === 'checkBvidUnique') {
        return buildReadPolicy(2 * 60 * 1000);
      }
      return { mode: 'write' };
    case 'animationMySubmissions':
      return buildReadPolicy(60 * 1000, true);
    case 'animationReview':
      if (action === 'list' || action === 'get') {
        return buildReadPolicy(60 * 1000);
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

  private getCacheKey(name: string, data: CloudFunctionData, policy: CloudRequestPolicy) {
    if (policy.mode !== 'read') {
      return '';
    }
    return buildCloudCacheKey(name, data, !!policy.userScoped);
  }

  private getReusableRequest(cacheKey: string, name: string) {
    if (!cacheKey) {
      return null;
    }
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
    return null;
  }

  private persistReadCache(
    name: string,
    data: CloudFunctionData,
    result: CloudFunctionResultData,
    policy: CloudRequestPolicy,
    cacheKey: string,
    res: Taro.cloud.CallFunctionResult,
  ) {
    if (!cacheKey || !policy.ttlMs || !isValidCacheableResult(result)) {
      return;
    }
    const cacheTags = buildCacheTags(name, data, result, !!policy.userScoped);
    RequestCacheService.set(cacheKey, res, policy.ttlMs, cacheTags);
  }

  private invalidateWriteCache(
    name: string,
    data: CloudFunctionData,
    result: CloudFunctionResultData,
    policy: CloudRequestPolicy,
  ) {
    if (policy.mode !== 'write' || !isValidCacheableResult(result)) {
      return;
    }
    const invalidationTags = buildInvalidationTags(name, data, result);
    const cleared = RequestCacheService.invalidateByTags(invalidationTags);
    if (cleared > 0) {
      console.log(`[Cloud] ♻ invalidated request cache after write: ${name}`, {
        cleared,
        tags: invalidationTags,
      });
    }
  }

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
    options: CloudFunctionOptions = {},
  ): Promise<Taro.cloud.CallFunctionResult> {
    if (!this.initialized) this.init();
    const policy = getCloudRequestPolicy(name, data);
    const cacheKey = this.getCacheKey(name, data, policy);
    const reusableRequest = this.getReusableRequest(cacheKey, name);
    if (reusableRequest) {
      return reusableRequest;
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
        const result = getCloudResult(res);
        // 透出 success/error 字段，方便区分业务失败与网络失败
        if (result?.success === false) {
          console.warn(`[Cloud] ✖ ${name} ${callId} business-fail ${cost}ms`, result);
        } else {
          console.log(`[Cloud] ✓ ${name} ${callId} ok ${cost}ms`);
          this.persistReadCache(name, data, result, policy, cacheKey, res);
          this.invalidateWriteCache(name, data, result, policy);
        }
        return res;
      } catch (err: any) {
        const cost = Date.now() - started;
        // 微信默认 10s 超时会返回 errMsg="timeout"，无法定位来源
        // 包装成业务可识别的错误
        const wrapped = buildCallError(name, callId, cost, err);
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
    options?: CloudFunctionOptions,
  ): Promise<Record<string, any>> {
    const res = await this.callFunction(name, data, options);
    const result = getCloudResult(res);
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
    options?: CloudFunctionOptions,
  ): Promise<Record<string, any> | null> {
    try {
      const res = await this.callFunction(name, data, options);
      const result = getCloudResult(res);
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
