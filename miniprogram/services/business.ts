import { CloudService } from './cloud';
import { Rating, Collection, ScoreDistribution } from '@/types';
import { UserService } from './user';

/**
 * 业务服务层 —— 所有查询 / 修改全部走云函数，云函数内部操作数据库。
 * 客户端不持有 db 实例，DB 入口已从 CloudService 类型层移除。
 */

/** 列表排序方式 */
export type ListSort = 'publish_time' | 'play_count' | 'duration_asc' | 'duration_desc';

/** 列表分页结果（含总数） */
export interface ListResult {
  list: any[];
  total: number;
}

/**
 * 动画业务服务
 *  - list       → 云函数 listAnimations
 *  - getById    → 云函数 getAnimationById
 *  - search     → 云函数 search
 */
export const AnimationService = {
  /**
   * 分页获取动画列表
   * @param page     页码（从 0 开始）
   * @param pageSize 每页条数
   * @param sortBy   排序方式：发布时间倒序（默认）/ 播放量倒序 / 时长升序 / 时长降序
   */
  async list(
    page = 0,
    pageSize = 20,
    sortBy: ListSort = 'publish_time',
    category = '',
  ): Promise<ListResult> {
    const res = (await CloudService.callFunction('listAnimations', {
      page,
      pageSize,
      sortBy,
      category,
    })) as any;
    const result = res?.result as
      | { success?: boolean; data?: any[]; total?: number; error?: string }
      | undefined;
    if (result?.success) {
      return { list: result.data || [], total: result.total || 0 };
    }
    console.warn('[Animation] listAnimations 返回失败', result?.error);
    return { list: [], total: 0 };
  },

  /** 获取单个动画详情 */
  async getById(id: string) {
    const res = (await CloudService.callFunction('getAnimationById', {
      id,
    })) as any;
    const result = res?.result as
      | { success?: boolean; data?: any; error?: string }
      | undefined;
    if (result?.success) return result.data ?? null;
    console.warn('[Animation] getAnimationById 失败', result?.error);
    return null;
  },

  /**
   * 模糊搜索（按标题、UP主、tag）
   *  - 服务端负责 RegExp 候选集 + fuzzyScore 排序 + 分页
   *  - 客户端只传 keyword / page / pageSize
   */
  async search(keyword: string, page = 0, pageSize = 20, category = '') {
    if (!keyword || !keyword.trim()) return [];
    const res = (await CloudService.callFunction('search', {
      keyword: keyword.trim(),
      page,
      pageSize,
      category,
    })) as any;
    const result = res?.result as { data?: any[]; error?: string } | undefined;
    if (result?.error) {
      console.warn('[Animation] search 失败', result.error);
    }
    return result?.data || [];
  },
};

/**
 * 评分业务
 *  - 全部走云函数 rating（action: get / submit / listMy）
 */
export const RatingService = {
  /** 获取用户对某动画的评分 */
  async getMyRating(animationId: string): Promise<number> {
    if (!UserService.openid) return 0;
    const res = (await CloudService.callFunction('rating', {
      action: 'get',
      animation_id: animationId,
    })) as any;
    const result = res?.result as { success?: boolean; score?: number } | undefined;
    return result?.success ? result.score || 0 : 0;
  },

  /** 提交评分；云函数内部会自动触发 calcScore 聚合 */
  async submit(animationId: string, score: number): Promise<{ newRating: boolean }> {
    if (!UserService.openid) throw new Error('未登录');
    const res = (await CloudService.callFunction('rating', {
      action: 'submit',
      animation_id: animationId,
      score,
    })) as any;
    const result = res?.result as
      | { success?: boolean; newRating?: boolean; error?: string }
      | undefined;
    if (!result?.success) {
      throw new Error(result?.error || '提交评分失败');
    }
    return { newRating: !!result.newRating };
  },

  /** 获取用户全部评分（带分页 + 关联动画信息） */
  async listByUser(
    page = 0,
    pageSize = 20,
    includeAnim = false,
  ): Promise<{ list: Rating[]; total: number }> {
    if (!UserService.openid) return { list: [], total: 0 };
    const res = (await CloudService.callFunction('rating', {
      action: 'listMy',
      limit: pageSize,
      offset: page * pageSize,
      include_anim: includeAnim,
    })) as any;
    const result = res?.result as
      | { success?: boolean; data?: Rating[]; total?: number }
      | undefined;
    if (!result?.success) return { list: [], total: 0 };
    return { list: result.data || [], total: result.total || 0 };
  },
};

/**
 * 收藏 / 看过 业务
 *  - 全部走云函数 collection（action: getStatus / toggle / listMy）
 */
export const CollectionService = {
  async getStatus(
    animationId: string,
  ): Promise<{ isCollected: boolean; isWatched: boolean }> {
    if (!UserService.openid) return { isCollected: false, isWatched: false };
    const res = (await CloudService.callFunction('collection', {
      action: 'getStatus',
      animation_id: animationId,
    })) as any;
    const result = res?.result as
      | { success?: boolean; isCollected?: boolean; isWatched?: boolean }
      | undefined;
    if (result?.success) {
      return {
        isCollected: !!result.isCollected,
        isWatched: !!result.isWatched,
      };
    }
    return { isCollected: false, isWatched: false };
  },

  async toggle(
    animationId: string,
    type: 'collect' | 'watched',
    add: boolean,
  ): Promise<{ isCollected: boolean; isWatched: boolean }> {
    if (!UserService.openid) throw new Error('未登录');
    const res = (await CloudService.callFunction('collection', {
      action: 'toggle',
      animation_id: animationId,
      type,
      add,
    })) as any;
    const result = res?.result as
      | {
          success?: boolean;
          isCollected?: boolean;
          isWatched?: boolean;
          error?: string;
        }
      | undefined;
    if (!result?.success) {
      throw new Error(result?.error || '操作失败');
    }
    return {
      isCollected: !!result.isCollected,
      isWatched: !!result.isWatched,
    };
  },

  async listByUser(
    type: 'collect' | 'watched',
    page = 0,
    pageSize = 20,
    includeAnim = false,
  ): Promise<{ list: Collection[]; total: number }> {
    if (!UserService.openid) return { list: [], total: 0 };
    const res = (await CloudService.callFunction('collection', {
      action: 'listMy',
      type,
      limit: pageSize,
      offset: page * pageSize,
      include_anim: includeAnim,
    })) as any;
    const result = res?.result as
      | { success?: boolean; data?: Collection[]; total?: number }
      | undefined;
    if (!result?.success) return { list: [], total: 0 };
    return { list: result.data || [], total: result.total || 0 };
  },
};

/** 评分分布（贝叶斯计算）—— 走云函数 calcScore */
export const ScoreService = {
  async calc(animationId: string): Promise<{
    WR: number;
    R: number;
    v: number;
    C: number;
    distribution: ScoreDistribution;
  }> {
    try {
      const res = (await CloudService.callFunction('calcScore', {
        animation_id: animationId,
      })) as any;
      const result = res?.result as
        | {
            success?: boolean;
            WR?: number;
            R?: number;
            v?: number;
            C?: number;
            distribution?: ScoreDistribution;
          }
        | undefined;
      if (result?.success) {
        return {
          WR: result.WR || 0,
          R: result.R || 0,
          v: result.v || 0,
          C: result.C || 3.5,
          distribution: result.distribution || {},
        };
      }
    } catch (err) {
      console.warn('[Score] calcScore failed', err);
    }
    return { WR: 0, R: 0, v: 0, C: 3.5, distribution: {} };
  },
};
