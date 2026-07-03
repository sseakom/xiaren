import assert from 'assert';
import {
  CacheStorageAdapter,
  RequestCacheCore,
  createHash,
  stableSerialize,
} from '../miniprogram/utils/requestCacheCore';

class MemoryStorage implements CacheStorageAdapter {
  private readonly data = new Map<string, string>();

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }
}

class BrokenStorage implements CacheStorageAdapter {
  getItem(_key: string): string | null {
    throw new Error('read failed');
  }

  setItem(_key: string, _value: string): void {
    throw new Error('write failed');
  }

  removeItem(_key: string): void {
    throw new Error('remove failed');
  }
}

function buildRequestKey(name: string, data?: Record<string, any>, scopeToken = 'public') {
  return `${name}:${createHash(
    stableSerialize({
      interfaceId: name,
      scopeToken,
      data: data ?? null,
    }),
  )}`;
}

function isValidResult(result: any) {
  if (!result || typeof result !== 'object') return false;
  if (result.success === false) return false;
  if (typeof result.error === 'string' && result.error.trim()) return false;
  return true;
}

async function cachedRequest<T>(
  cache: RequestCacheCore,
  options: {
    name: string;
    data?: Record<string, any>;
    ttlMs: number;
    now: number;
    executor: () => Promise<T>;
    scopeToken?: string;
  },
) {
  const key = buildRequestKey(options.name, options.data, options.scopeToken);
  const cached = cache.get<T>(key, options.now);
  if (cached) {
    return { data: cached, fromCache: true };
  }
  const result = await options.executor();
  if (isValidResult(result)) {
    cache.set(key, result, {
      ttlMs: options.ttlMs,
      tags: [`fn:${options.name}`],
      now: options.now,
    });
  }
  return { data: result, fromCache: false };
}

async function testRepeatRequestHitsCache() {
  const cache = new RequestCacheCore(new MemoryStorage(), {
    storageKey: 'repeat-request',
    cleanupIntervalMs: 100,
  });
  let now = 1_000;
  let cloudCallCount = 0;
  const executor = async () => {
    cloudCallCount += 1;
    return { success: true, data: ['ok'] };
  };

  const first = await cachedRequest(cache, {
    name: 'listAnimations',
    data: { page: 0, pageSize: 20 },
    ttlMs: 5_000,
    now,
    executor,
  });
  const second = await cachedRequest(cache, {
    name: 'listAnimations',
    data: { page: 0, pageSize: 20 },
    ttlMs: 5_000,
    now,
    executor,
  });

  assert.equal(cloudCallCount, 1, '相同请求仅首次触发真实调用');
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true, '重复请求应直接命中缓存');
}

async function testExpiredCacheGetsReclaimed() {
  const cache = new RequestCacheCore(new MemoryStorage(), {
    storageKey: 'expired-cache',
    cleanupIntervalMs: 100,
  });
  let now = 2_000;
  const key = buildRequestKey('search', { keyword: '沙雕' });
  cache.set(
    key,
    { data: ['a'] },
    {
      ttlMs: 100,
      tags: ['fn:search'],
      now,
    },
  );

  now += 150;
  const value = cache.get(key, now);
  const cleanup = cache.cleanup(now);

  assert.equal(value, null, '过期缓存访问时应被清理');
  assert.equal(cleanup.entryCount, 0, '清理后不应残留过期条目');
}

async function testLruEvictionWorks() {
  const cache = new RequestCacheCore(new MemoryStorage(), {
    storageKey: 'lru-cache',
    maxSize: 90,
    maxEntrySize: 90,
    cleanupIntervalMs: 100,
  });
  const keyA = buildRequestKey('listAnimations', { page: 0, pageSize: 20, category: 'A' });
  const keyB = buildRequestKey('listAnimations', { page: 0, pageSize: 20, category: 'B' });
  const keyC = buildRequestKey('listAnimations', { page: 0, pageSize: 20, category: 'C' });

  cache.set(keyA, { payload: 'aaaaa' }, { ttlMs: 10_000, now: 1_000 });
  cache.set(keyB, { payload: 'bbbbb' }, { ttlMs: 10_000, now: 1_100 });
  cache.get(keyA, 1_200);
  cache.set(keyC, { payload: 'ccccc' }, { ttlMs: 10_000, now: 1_300 });

  assert.notEqual(cache.get(keyA, 1_400), null, '最近访问的条目应保留');
  assert.equal(cache.get(keyB, 1_400), null, '最久未访问的条目应被淘汰');
  assert.notEqual(cache.get(keyC, 1_400), null, '新写入条目应保留');
}

async function testBrokenStorageFallsBackGracefully() {
  const cache = new RequestCacheCore(new BrokenStorage(), {
    storageKey: 'broken-storage',
    cleanupIntervalMs: 100,
  });
  let cloudCallCount = 0;
  const executor = async () => {
    cloudCallCount += 1;
    return { success: true, data: { ok: true } };
  };

  const first = await cachedRequest(cache, {
    name: 'calcScore',
    data: { animation_id: 'anim-1' },
    ttlMs: 1_000,
    now: 1_000,
    executor,
  });
  const second = await cachedRequest(cache, {
    name: 'calcScore',
    data: { animation_id: 'anim-1' },
    ttlMs: 1_000,
    now: 1_000,
    executor,
  });

  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, false, '缓存异常时应自动降级为真实请求');
  assert.equal(cloudCallCount, 2, '降级后不应阻塞核心业务流程');
}

async function testInvalidateByTagsOnlyRemovesMatchingEntries() {
  const cache = new RequestCacheCore(new MemoryStorage(), {
    storageKey: 'invalidate-by-tags',
    cleanupIntervalMs: 100,
  });
  const keepKey = buildRequestKey('listAnimations', { page: 0 });
  const removeKeyA = buildRequestKey('rating', { action: 'listMy' }, 'user:u1');
  const removeKeyB = buildRequestKey('calcScore', { animation_id: 'anim-1' });

  cache.set(keepKey, { success: true, data: ['list'] }, {
    ttlMs: 5_000,
    now: 1_000,
    tags: ['animations:list', 'animation:anim-2'],
  });
  cache.set(removeKeyA, { success: true, data: ['rating'] }, {
    ttlMs: 5_000,
    now: 1_000,
    tags: ['user:ratings@user:u1', 'animation:anim-1'],
  });
  cache.set(removeKeyB, { success: true, WR: 4.2 }, {
    ttlMs: 5_000,
    now: 1_000,
    tags: ['animation:anim-1:score'],
  });

  const removed = cache.invalidateByTags(['animation:anim-1', 'animation:anim-1:score'], 1_100);

  assert.equal(removed, 2, '仅应清理命中失效 tag 的缓存条目');
  assert.notEqual(cache.get(keepKey, 1_200), null, '无关缓存应保留');
  assert.equal(cache.get(removeKeyA, 1_200), null, '命中动画 tag 的缓存应被清理');
  assert.equal(cache.get(removeKeyB, 1_200), null, '命中评分 tag 的缓存应被清理');
}

async function run() {
  await testRepeatRequestHitsCache();
  await testExpiredCacheGetsReclaimed();
  await testLruEvictionWorks();
  await testBrokenStorageFallsBackGracefully();
  await testInvalidateByTagsOnlyRemovesMatchingEntries();
  console.log('request-cache tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
