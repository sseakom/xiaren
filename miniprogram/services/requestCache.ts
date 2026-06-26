import Taro from '@tarojs/taro';
import {
  CacheCleanupResult,
  RequestCacheCore,
  createHash,
  stableSerialize,
} from '@/utils/requestCacheCore';

const OPENID_CACHE_KEY = 'user_openid_cache';

const requestCache = new RequestCacheCore(
  {
    getItem(key) {
      const value = Taro.getStorageSync(key);
      return typeof value === 'string' ? value : null;
    },
    setItem(key, value) {
      Taro.setStorageSync(key, value);
    },
    removeItem(key) {
      Taro.removeStorageSync(key);
    },
  },
  {
    storageKey: 'cloud_request_cache_v1',
    version: 1,
    maxSize: 768 * 1024,
    maxEntrySize: 128 * 1024,
    cleanupIntervalMs: 5 * 60 * 1000,
  },
);

function resolveScopeToken(userScoped: boolean) {
  if (!userScoped) return 'public';
  const openid = Taro.getStorageSync(OPENID_CACHE_KEY) as string | undefined;
  return openid ? `user:${openid}` : 'guest';
}

export function buildCloudCacheKey(
  name: string,
  data?: Record<string, any>,
  userScoped = false,
): string {
  const scopeToken = resolveScopeToken(userScoped);
  const payloadHash = createHash(
    stableSerialize({
      interfaceId: name,
      scopeToken,
      data: data ?? null,
    }),
  );
  return `${name}:${payloadHash}`;
}

class RequestCacheServiceImpl {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  get<T = any>(key: string): T | null {
    return requestCache.get<T>(key);
  }

  set(key: string, value: any, ttlMs: number, tags: string[] = []) {
    return requestCache.set(key, value, { ttlMs, tags });
  }

  invalidateByTags(tags: string[]) {
    return requestCache.invalidateByTags(tags);
  }

  clearAll() {
    return requestCache.clear();
  }

  cleanup(trigger = 'manual'): CacheCleanupResult {
    const result = requestCache.cleanup();
    if (result.removedExpired || result.removedLru || result.removedManual) {
      console.log(`[RequestCache] cleanup by ${trigger}`, result);
    }
    return result;
  }

  runScheduledCleanup(trigger = 'scheduled'): CacheCleanupResult {
    const result = requestCache.runScheduledCleanup();
    if (!result.skipped && (result.removedExpired || result.removedLru || result.removedManual)) {
      console.log(`[RequestCache] scheduled cleanup by ${trigger}`, result);
    }
    return result;
  }

  startPeriodicCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.runScheduledCleanup('timer');
    }, 5 * 60 * 1000);
  }

  stopPeriodicCleanup() {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}

export const RequestCacheService = new RequestCacheServiceImpl();
