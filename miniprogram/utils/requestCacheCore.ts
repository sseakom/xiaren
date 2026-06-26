export interface CacheStorageAdapter {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CacheEntry<T = any> {
  value: T;
  size: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  expiresAt: number;
}

interface CacheState {
  version: number;
  totalSize: number;
  lastSweepAt: number;
  entries: Record<string, CacheEntry>;
}

export interface CacheSetOptions {
  ttlMs: number;
  tags?: string[];
  now?: number;
}

export interface RequestCacheOptions {
  storageKey?: string;
  version?: number;
  maxSize?: number;
  maxEntrySize?: number;
  cleanupIntervalMs?: number;
}

export interface CacheCleanupResult {
  removedExpired: number;
  removedLru: number;
  removedManual: number;
  totalSize: number;
  entryCount: number;
  skipped?: boolean;
}

const DEFAULT_OPTIONS: Required<RequestCacheOptions> = {
  storageKey: 'cloud_request_cache_v1',
  version: 1,
  maxSize: 768 * 1024,
  maxEntrySize: 128 * 1024,
  cleanupIntervalMs: 5 * 60 * 1000,
};

function createEmptyState(version: number): CacheState {
  return {
    version,
    totalSize: 0,
    lastSweepAt: 0,
    entries: {},
  };
}

function normalizeValue(value: any): any {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const normalized: Record<string, any> = {};
    keys.forEach((key) => {
      const nextValue = value[key];
      if (nextValue === undefined) return;
      normalized[key] = normalizeValue(nextValue);
    });
    return normalized;
  }
  return String(value);
}

export function stableSerialize(value: any): string {
  return JSON.stringify(normalizeValue(value));
}

export function createHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export class RequestCacheCore {
  private readonly options: Required<RequestCacheOptions>;

  constructor(
    private readonly adapter: CacheStorageAdapter,
    options: RequestCacheOptions = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  getStorageKey() {
    return this.options.storageKey;
  }

  get<T = any>(key: string, now = Date.now()): T | null {
    try {
      const state = this.readState();
      let dirty = false;
      dirty = this.removeExpiredEntries(state, now) > 0 || dirty;
      const entry = state.entries[key];
      if (!entry) {
        if (dirty) this.writeState(state);
        return null;
      }
      entry.lastAccessedAt = now;
      entry.updatedAt = now;
      this.writeState(state);
      return entry.value as T;
    } catch (err) {
      console.warn('[RequestCache] get failed, fallback to miss', err);
      return null;
    }
  }

  set(key: string, value: any, options: CacheSetOptions): boolean {
    const now = options.now ?? Date.now();
    try {
      const serializedValue = stableSerialize(value);
      const size = serializedValue.length;
      if (size <= 0 || size > this.options.maxEntrySize) {
        return false;
      }
      const state = this.readState();
      this.removeExpiredEntries(state, now);
      const prev = state.entries[key];
      if (prev) {
        state.totalSize -= prev.size;
      }
      state.entries[key] = {
        value,
        size,
        tags: [...new Set(options.tags || [])],
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        lastAccessedAt: now,
        expiresAt: now + Math.max(1, options.ttlMs),
      };
      state.totalSize += size;
      const removedLru = this.removeOverflowEntries(state);
      if (removedLru > 0) {
        state.lastSweepAt = now;
      }
      this.writeState(state);
      return true;
    } catch (err) {
      console.warn('[RequestCache] set failed, ignore cache write', err);
      return false;
    }
  }

  invalidateByTags(tags: string[], now = Date.now()): number {
    if (!tags.length) return 0;
    try {
      const state = this.readState();
      const targets = new Set(tags);
      let removed = 0;
      Object.keys(state.entries).forEach((key) => {
        const entry = state.entries[key];
        if (!entry.tags.some((tag) => targets.has(tag))) return;
        state.totalSize -= entry.size;
        delete state.entries[key];
        removed += 1;
      });
      if (removed > 0) {
        state.lastSweepAt = now;
        this.writeState(state);
      }
      return removed;
    } catch (err) {
      console.warn('[RequestCache] invalidateByTags failed', err);
      return 0;
    }
  }

  clear(now = Date.now()): number {
    try {
      const state = this.readState();
      const removed = Object.keys(state.entries).length;
      if (removed === 0) return 0;
      const nextState = createEmptyState(this.options.version);
      nextState.lastSweepAt = now;
      this.writeState(nextState);
      return removed;
    } catch (err) {
      console.warn('[RequestCache] clear failed', err);
      try {
        this.adapter.removeItem(this.options.storageKey);
      } catch (removeErr) {
        console.warn('[RequestCache] remove storage failed', removeErr);
      }
      return 0;
    }
  }

  cleanup(now = Date.now()): CacheCleanupResult {
    try {
      const state = this.readState();
      const removedExpired = this.removeExpiredEntries(state, now);
      const removedLru = this.removeOverflowEntries(state);
      state.lastSweepAt = now;
      this.writeState(state);
      return {
        removedExpired,
        removedLru,
        removedManual: 0,
        totalSize: state.totalSize,
        entryCount: Object.keys(state.entries).length,
      };
    } catch (err) {
      console.warn('[RequestCache] cleanup failed', err);
      return {
        removedExpired: 0,
        removedLru: 0,
        removedManual: 0,
        totalSize: 0,
        entryCount: 0,
      };
    }
  }

  runScheduledCleanup(now = Date.now()): CacheCleanupResult {
    try {
      const state = this.readState();
      if (now - state.lastSweepAt < this.options.cleanupIntervalMs) {
        return {
          removedExpired: 0,
          removedLru: 0,
          removedManual: 0,
          totalSize: state.totalSize,
          entryCount: Object.keys(state.entries).length,
          skipped: true,
        };
      }
      const removedExpired = this.removeExpiredEntries(state, now);
      const removedLru = this.removeOverflowEntries(state);
      state.lastSweepAt = now;
      this.writeState(state);
      return {
        removedExpired,
        removedLru,
        removedManual: 0,
        totalSize: state.totalSize,
        entryCount: Object.keys(state.entries).length,
      };
    } catch (err) {
      console.warn('[RequestCache] scheduled cleanup failed', err);
      return {
        removedExpired: 0,
        removedLru: 0,
        removedManual: 0,
        totalSize: 0,
        entryCount: 0,
      };
    }
  }

  private readState(): CacheState {
    const raw = this.adapter.getItem(this.options.storageKey);
    if (!raw) {
      return createEmptyState(this.options.version);
    }
    try {
      const parsed = JSON.parse(raw) as CacheState;
      if (!parsed || parsed.version !== this.options.version || typeof parsed.entries !== 'object') {
        return createEmptyState(this.options.version);
      }
      const state = createEmptyState(this.options.version);
      state.lastSweepAt = Number(parsed.lastSweepAt) || 0;
      Object.keys(parsed.entries || {}).forEach((key) => {
        const entry = parsed.entries[key];
        if (!entry) return;
        const size = Number(entry.size) || stableSerialize(entry.value).length;
        state.entries[key] = {
          value: entry.value,
          size,
          tags: Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [],
          createdAt: Number(entry.createdAt) || 0,
          updatedAt: Number(entry.updatedAt) || 0,
          lastAccessedAt: Number(entry.lastAccessedAt) || 0,
          expiresAt: Number(entry.expiresAt) || 0,
        };
        state.totalSize += size;
      });
      return state;
    } catch (err) {
      console.warn('[RequestCache] readState parse failed, reset cache', err);
      return createEmptyState(this.options.version);
    }
  }

  private writeState(state: CacheState) {
    state.totalSize = Object.values(state.entries).reduce((sum, entry) => sum + entry.size, 0);
    this.adapter.setItem(this.options.storageKey, JSON.stringify(state));
  }

  private removeExpiredEntries(state: CacheState, now: number): number {
    let removed = 0;
    Object.keys(state.entries).forEach((key) => {
      const entry = state.entries[key];
      if (entry.expiresAt > now) return;
      state.totalSize -= entry.size;
      delete state.entries[key];
      removed += 1;
    });
    return removed;
  }

  private removeOverflowEntries(state: CacheState): number {
    if (state.totalSize <= this.options.maxSize) return 0;
    const candidates = Object.entries(state.entries).sort(([, a], [, b]) => {
      if (a.lastAccessedAt !== b.lastAccessedAt) {
        return a.lastAccessedAt - b.lastAccessedAt;
      }
      return a.createdAt - b.createdAt;
    });
    let removed = 0;
    candidates.forEach(([key, entry]) => {
      if (state.totalSize <= this.options.maxSize) return;
      state.totalSize -= entry.size;
      delete state.entries[key];
      removed += 1;
    });
    return removed;
  }
}
