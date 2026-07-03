import Taro from '@tarojs/taro';
import { Animation } from '@/types';
import { CloudService } from './cloud';
import { ListResult } from './cloudListAdapter';
import { fuzzyScore } from '@/utils/fuzzy';

const DATASET_STORAGE_KEY = 'animations_dataset_payload_v1';
const DATASET_VERSION_STORAGE_KEY = 'animations_dataset_version_v1';
const DATASET_UPDATED_AT_STORAGE_KEY = 'animations_dataset_updated_at_v1';

export interface AnimationSnapshot {
  bvid: string;
  title: string;
  original_title?: string;
  up_name: string;
  cover: string;
  duration: number;
  play_count: number;
  danmaku_count: number;
  like_count: number;
  score?: number;
  publish_time: string;
  tag?: string;
  tags?: string[];
}

type DatasetListSort =
  | 'publish_time'
  | 'play_count_asc'
  | 'play_count_desc'
  | 'danmaku_count_asc'
  | 'danmaku_count_desc'
  | 'duration_asc'
  | 'duration_desc';

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

function toSafeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTagList(tag: unknown) {
  if (Array.isArray(tag)) {
    return tag.map((item) => normalizeString(item)).filter(Boolean);
  }
  return normalizeString(tag)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSnapshotItem(item: any): AnimationSnapshot | null {
  if (!item || typeof item !== 'object') return null;
  const bvid = normalizeString(item.bvid);
  if (!bvid) return null;
  const tags = normalizeTagList(item.tags?.length ? item.tags : item.tag);
  const score = Number(item.score);
  return {
    bvid,
    title: normalizeString(item.title),
    original_title: normalizeString(item.original_title),
    up_name: normalizeString(item.up_name),
    cover: normalizeString(item.cover),
    duration: toSafeNumber(item.duration),
    play_count: toSafeNumber(item.play_count),
    danmaku_count: toSafeNumber(item.danmaku_count),
    like_count: toSafeNumber(item.like_count),
    publish_time: normalizeString(item.publish_time),
    tag: tags.join(','),
    tags,
    ...(Number.isFinite(score) ? { score } : {}),
  };
}

function toAnimation(item: AnimationSnapshot): Animation {
  return {
    _id: item.bvid,
    bvid: item.bvid,
    title: item.title,
    original_title: item.original_title || '',
    url: '',
    up_name: item.up_name,
    cover: item.cover,
    duration: item.duration,
    play_count: item.play_count,
    danmaku_count: item.danmaku_count,
    like_count: item.like_count,
    publish_time: item.publish_time,
    update_time: item.publish_time,
    tag: item.tag || '',
    tags: Array.isArray(item.tags) ? item.tags : normalizeTagList(item.tag),
    ...(typeof item.score === 'number' ? { score: item.score } : {}),
  };
}

function compareBySort(a: AnimationSnapshot, b: AnimationSnapshot, sortBy: DatasetListSort) {
  switch (sortBy) {
    case 'play_count_asc':
      return a.play_count - b.play_count;
    case 'play_count_desc':
      return b.play_count - a.play_count;
    case 'danmaku_count_asc':
      return a.danmaku_count - b.danmaku_count;
    case 'danmaku_count_desc':
      return b.danmaku_count - a.danmaku_count;
    case 'duration_asc':
      return a.duration - b.duration;
    case 'duration_desc':
      return b.duration - a.duration;
    case 'publish_time':
    default:
      return new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime();
  }
}

function matchListCategory(item: AnimationSnapshot, category: string) {
  const q = normalizeString(category).toLowerCase();
  if (!q) return true;
  const tags = normalizeTagList(item.tags?.length ? item.tags : item.tag).map((tag) => tag.toLowerCase());
  if (tags.some((tag) => tag.includes(q))) return true;
  return normalizeString(item.original_title).toLowerCase().includes(q);
}

function hasSearchCategory(item: AnimationSnapshot, category: string) {
  const target = normalizeString(category);
  if (!target) return true;
  return normalizeTagList(item.tags?.length ? item.tags : item.tag).includes(target);
}

function buildSearchScore(item: AnimationSnapshot, keyword: string) {
  const titleScore = fuzzyScore(item.title || '', keyword);
  const upScore = fuzzyScore(item.up_name || '', keyword);
  const tagScore = normalizeTagList(item.tags?.length ? item.tags : item.tag).reduce((max, tag) => {
    const score = fuzzyScore(tag, keyword);
    return score > max ? score : max;
  }, 0);
  return Math.max(titleScore * 2, upScore, tagScore);
}

class AnimationDatasetServiceImpl {
  private list: AnimationSnapshot[] = [];
  private version = '';
  private ready = false;
  private bootstrapPromise: Promise<void> | null = null;

  private readLocalList() {
    try {
      const raw = Taro.getStorageSync(DATASET_STORAGE_KEY);
      if (!Array.isArray(raw)) return [];
      return raw.map((item) => normalizeSnapshotItem(item)).filter(Boolean) as AnimationSnapshot[];
    } catch (err) {
      console.warn('[AnimationDataset] 读取本地缓存失败', err);
      return [];
    }
  }

  private readLocalVersion() {
    try {
      return normalizeString(Taro.getStorageSync(DATASET_VERSION_STORAGE_KEY));
    } catch (err) {
      console.warn('[AnimationDataset] 读取本地版本失败', err);
      return '';
    }
  }

  private persist(list: AnimationSnapshot[], version: string) {
    this.list = list;
    this.version = version;
    Taro.setStorageSync(DATASET_STORAGE_KEY, list);
    Taro.setStorageSync(DATASET_VERSION_STORAGE_KEY, version);
    Taro.setStorageSync(DATASET_UPDATED_AT_STORAGE_KEY, Date.now());
  }

  private async fetchRemoteVersion() {
    const res = await CloudService.callFunction('animationsVersion');
    return normalizeString((res as any)?.result?.version);
  }

  private async fetchRemoteSnapshot() {
    const result = await CloudService.callCloudSafe(
      'listAnimations',
      { action: 'snapshot' },
      { timeoutMs: 60_000 },
    );
    if (!result) {
      return null;
    }
    const data = Array.isArray(result?.data) ? result.data : [];
    return data.map((item) => normalizeSnapshotItem(item)).filter(Boolean) as AnimationSnapshot[];
  }

  private async doBootstrap() {
    const localList = this.readLocalList();
    const localVersion = this.readLocalVersion();
    if (localList.length > 0) {
      this.list = localList;
      this.version = localVersion;
    }

    try {
      const remoteVersion = await this.fetchRemoteVersion();
      if (remoteVersion && localList.length > 0 && localVersion === remoteVersion) {
        this.ready = true;
        return;
      }

      const remoteList = await this.fetchRemoteSnapshot();
      if (remoteList) {
        this.persist(remoteList, remoteVersion || localVersion || '');
      } else if (!localList.length) {
        this.list = [];
        this.version = remoteVersion || '';
      }
    } catch (err) {
      console.warn('[AnimationDataset] 启动同步失败，回退本地缓存', err);
      if (!localList.length) {
        this.list = [];
        this.version = '';
      }
    } finally {
      this.ready = true;
    }
  }

  async bootstrap(force = false) {
    if (this.ready && !force) return;
    if (this.bootstrapPromise && !force) return this.bootstrapPromise;
    this.ready = false;
    this.bootstrapPromise = this.doBootstrap();
    this.bootstrapPromise.then(() => {
      this.bootstrapPromise = null;
    }, () => {
      this.bootstrapPromise = null;
    });
    return this.bootstrapPromise;
  }

  async ensureReady() {
    if (this.ready) return;
    await this.bootstrap();
  }

  async listPage(
    page = 0,
    pageSize = 20,
    sortBy: DatasetListSort = 'publish_time',
    category = '',
  ): Promise<ListResult<Animation>> {
    await this.ensureReady();
    const filtered = this.list
      .filter((item) => matchListCategory(item, category))
      .sort((a, b) => compareBySort(a, b, sortBy));
    const start = page * pageSize;
    const sliced = filtered.slice(start, start + pageSize).map((item) => toAnimation(item));
    return { list: sliced, total: filtered.length };
  }

  async searchPage(
    keyword: string,
    page = 0,
    pageSize = 20,
    category = '',
  ): Promise<ListResult<Animation>> {
    const trimmedKeyword = normalizeString(keyword);
    if (!trimmedKeyword) {
      return { list: [], total: 0 };
    }

    await this.ensureReady();
    const scored = this.list
      .filter((item) => hasSearchCategory(item, category))
      .map((item) => ({ item, score: buildSearchScore(item, trimmedKeyword) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const start = page * pageSize;
    const list = scored.slice(start, start + pageSize).map((entry) => toAnimation(entry.item));
    return { list, total: scored.length };
  }

  async getByBvid(bvid: string): Promise<Animation | null> {
    const targetBvid = normalizeString(bvid);
    if (!targetBvid) return null;
    await this.ensureReady();
    const found = this.list.find((item) => item.bvid === targetBvid);
    return found ? toAnimation(found) : null;
  }

  async getMapByBvids(bvids: string[]): Promise<Map<string, Animation>> {
    await this.ensureReady();
    const targetSet = new Set(bvids.map((item) => normalizeString(item)).filter(Boolean));
    const map = new Map<string, Animation>();
    if (targetSet.size === 0) {
      return map;
    }
    this.list.forEach((item) => {
      if (targetSet.has(item.bvid)) {
        map.set(item.bvid, toAnimation(item));
      }
    });
    return map;
  }

  getVersion() {
    return this.version;
  }
}

export const AnimationDatasetService = new AnimationDatasetServiceImpl();
