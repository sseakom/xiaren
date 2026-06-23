import { CloudService } from './cloud';
import { Rating, ScoreDistribution } from '@/types';
import { UserService } from './user';
import { fuzzyMatch, fuzzyRank } from '@/utils/fuzzy';

/**
 * 把 duration 字段统一解析成秒数
 *   - number         → 原值
 *   - "1000:23"      → 1000 * 60 + 23
 *   - "1:23:45"      → 1 * 3600 + 23 * 60 + 45
 *   - "285"          → 285
 *   - 其他/空        → 0
 *
 * 与 cloudfunctions/listAnimations/index.js 的 parseDurationToSec 保持一致。
 * 排序按"冒号前的分钟数"实际对应的是总秒数（1000 分钟 = 60000 秒）。
 */
function parseDurationToSec(d: unknown): number {
  if (d == null) return 0;
  if (typeof d === 'number') {
    return isFinite(d) && d >= 0 ? d : 0;
  }
  const str = String(d).trim();
  if (!str) return 0;
  if (/^\d+(:\d+){1,2}$/.test(str)) {
    const parts = str.split(':').map(Number);
    if (parts.length === 2) {
      const [m, s] = parts;
      return m * 60 + s;
    }
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = Number(str);
    return isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

/**
 * 动画业务服务
 */
/** 列表排序方式 */
export type ListSort = 'publish_time' | 'play_count' | 'duration_asc' | 'duration_desc';

/** 列表分页结果（含总数） */
export interface ListResult {
  list: any[];
  total: number;
}

export const AnimationService = {
  /**
   * 分页获取动画列表（走云函数 listAnimations）
   * @param page 页码（从 0 开始）
   * @param pageSize 每页条数
   * @param sortBy 排序方式：发布时间倒序（默认） / 播放量倒序 / 时长升序 / 时长降序
   *
   * 实现说明：服务端做 count + orderBy + skip + limit，前端只拿当前页。
   * 返回 { list, total }：前端按 total 判定 hasMore（避免末页 < pageSize 时误判）。
   * 云函数失败时降级为客户端全量查询 + 内存分页，保证旧环境也能跑。
   */
  async list(
    page = 0,
    pageSize = 20,
    sortBy: ListSort = 'publish_time',
  ): Promise<ListResult> {
    try {
      const res = (await CloudService.callFunction('listAnimations', {
        page,
        pageSize,
        sortBy,
      })) as any;
      const result = res?.result as
        | { success?: boolean; data?: any[]; total?: number; error?: string }
        | undefined;
      if (result?.success) {
        return {
          list: result.data || [],
          total: result.total || 0,
        };
      }
      console.warn('[Animation] listAnimations 返回失败,降级客户端分页', result?.error);
    } catch (err) {
      console.warn('[Animation] listAnimations 调用失败,降级客户端分页', err);
    }
    return this.listClientFallback(page, pageSize, sortBy);
  },

  /** 降级方案：直接查 DB + 内存排序 + slice（云函数不可用时） */
  async listClientFallback(
    page: number,
    pageSize: number,
    sortBy: ListSort,
  ): Promise<ListResult> {
    const res = await CloudService.db
      .collection('animations')
      .limit(1000)
      .get();
    const data = (res.data || []) as any[];
    const sorted = [...data].sort((a, b) => {
      switch (sortBy) {
        case 'play_count':
          return (b.play_count || 0) - (a.play_count || 0);
        case 'duration_asc':
          return parseDurationToSec(a.duration) - parseDurationToSec(b.duration);
        case 'duration_desc':
          return parseDurationToSec(b.duration) - parseDurationToSec(a.duration);
        case 'publish_time':
        default:
          return new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime();
      }
    });
    return {
      list: sorted.slice(page * pageSize, (page + 1) * pageSize),
      total: sorted.length,
    };
  },

  /** 获取单个动画详情 */
  async getById(id: string) {
    // Taro 的 doc().get() 类型是 () => void | ({}) => Promise<IQuerySingleResult> 双重重载
    // 用 as any 强制走 Promise 重载 + 补 {} 满足"应传 1 个参数"
    const res = (await (CloudService.db.collection('animations').doc(id).get({} as any) as any)) as { data: any };
    return res.data;
  },

  /**
   * 模糊搜索（按标题、UP主）
   *  - DB 端用宽松 RegExp 拉一个候选集（200 条上限）
   *  - JS 端再按 fuzzyScore 排序（exact > prefix > includes > 字符有序 > 字符全包含）
   *  - 最后分页返回
   */
  async search(keyword: string, page = 0, pageSize = 20) {
    if (!keyword || !keyword.trim()) return [];
    const k = keyword.trim();
    // 关键词里有"非 ASCII"字符（中文等），放宽为"任一 token 命中"以扩大候选集
    const hasNonAscii = /[^\x00-\x7f]/.test(k);
    const pattern = hasNonAscii
      ? CloudService.db.RegExp({
          regexp: k.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
          options: 'i',
        })
      : CloudService.db.RegExp({ regexp: k, options: 'i' });
    const cmd = CloudService._;
    const res = await CloudService.db
      .collection('animations')
      .where(
        cmd.or([
          { title: pattern },
          { up_name: pattern },
        ]),
      )
      .orderBy('publish_time', 'desc')
      .limit(200)
      .get();
    // 客户端二次过滤（过滤掉非真模糊命中的）+ 排序
    const matched = (res.data || []).filter(
      (a: any) => fuzzyMatch(a.title, k) || fuzzyMatch(a.up_name, k),
    );
    const ranked = fuzzyRank(matched, k, (a: any) => a.title || a.up_name || '');
    return ranked.slice(page * pageSize, (page + 1) * pageSize);
  },
};

/**
 * 评分业务
 */
export const RatingService = {
  /** 获取用户对某动画的评分 */
  async getMyRating(animationId: string): Promise<number> {
    if (!UserService.openid) return 0;
    const res = await CloudService.db
      .collection('ratings')
      .where({ user_id: UserService.openid, animation_id: animationId })
      .get();
    if (res.data.length === 0) return 0;
    return (res.data[0] as Rating).score;
  },

  /** 提交评分 */
  async submit(animationId: string, score: number): Promise<{ newRating: boolean }> {
    if (!UserService.openid) throw new Error('未登录');
    const exist = await CloudService.db
      .collection('ratings')
      .where({ user_id: UserService.openid, animation_id: animationId })
      .get();
    const now = new Date();
    let newRating = false;
    if (exist.data.length > 0) {
      // exist.data[0]._id 类型是 DocumentId | undefined
      // 业务上存在就是有 _id，用 String() 收紧类型
      const docId = String(exist.data[0]._id);
      await CloudService.db.collection('ratings').doc(docId).update({
        data: { score, updated_at: now },
      });
    } else {
      await CloudService.db.collection('ratings').add({
        data: {
          user_id: UserService.openid,
          animation_id: animationId,
          score,
          created_at: now,
          updated_at: now,
        },
      });
      newRating = true;
    }
    // 触发贝叶斯评分计算
    CloudService.callFunction('calcScore', { animation_id: animationId }).catch(
      (err) => console.error('[Rating] calcScore failed', err),
    );
    return { newRating };
  },

  /** 获取用户全部评分 */
  async listByUser(limit = 50): Promise<Rating[]> {
    if (!UserService.openid) return [];
    const res = await CloudService.db
      .collection('ratings')
      .where({ user_id: UserService.openid })
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .get();
    return res.data as Rating[];
  },
};

/**
 * 收藏/看过 业务
 */
export const CollectionService = {
  async getStatus(animationId: string): Promise<{ isCollected: boolean; isWatched: boolean }> {
    if (!UserService.openid) return { isCollected: false, isWatched: false };
    const res = await CloudService.db
      .collection('collections')
      .where({ user_id: UserService.openid, animation_id: animationId })
      .get();
    let isCollected = false;
    let isWatched = false;
    (res.data as any[]).forEach((c) => {
      if (c.type === 'collect') isCollected = true;
      if (c.type === 'watched') isWatched = true;
    });
    return { isCollected, isWatched };
  },

  async toggle(animationId: string, type: 'collect' | 'watched', add: boolean) {
    if (!UserService.openid) throw new Error('未登录');
    const res = await CloudService.db
      .collection('collections')
      .where({ user_id: UserService.openid, animation_id: animationId, type })
      .get();
    if (add) {
      if (res.data.length === 0) {
        await CloudService.db.collection('collections').add({
          data: {
            user_id: UserService.openid,
            animation_id: animationId,
            type,
            created_at: new Date(),
          },
        });
      }
    } else {
      if (res.data.length > 0) {
        // res.data[0]._id 类型是 DocumentId | undefined，业务存在则有
        const docId = String(res.data[0]._id);
        // Taro 的 doc().remove() 类型是 () => void & ({}?) => Promise<...> 双重重载
        // 用 Promise<any> 包装强制走 Promise 分支，避免"await 无效"hint
        await new Promise<void>((resolve) => {
          (CloudService.db.collection('collections').doc(docId).remove({} as any) as any);
          resolve();
        });
      }
    }
  },

  async listByUser(type: 'collect' | 'watched', limit = 50) {
    if (!UserService.openid) return [];
    const res = await CloudService.db
      .collection('collections')
      .where({ user_id: UserService.openid, type })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    return res.data;
  },
};

/** 评分分布（贝叶斯计算） */
export const ScoreService = {
  async calc(animationId: string): Promise<{
    WR: number;
    R: number;
    v: number;
    C: number;
    distribution: ScoreDistribution;
  }> {
    try {
      // Taro 的 callFunction 类型没有泛型参数
      const res = (await CloudService.callFunction('calcScore', { animation_id: animationId })) as any;
      const result = res?.result as { success?: boolean } | undefined;
      if (result?.success) return result as any;
    } catch (err) {
      console.warn('[Score] calcScore fallback', err);
    }
    return { WR: 0, R: 0, v: 0, C: 3.5, distribution: {} };
  },
};
