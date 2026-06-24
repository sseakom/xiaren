import { CloudService } from './cloud';
import {
  Rating,
  Collection,
  ScoreDistribution,
  Submission,
  SubmissionType,
} from '@/types';
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

/** 动画提交表单字段（录入/勘误共用） */
export interface AnimationFormPayload {
  title: string;
  bvid: string;
  up_name: string;
  cover: string;
  duration: number;
  tag: string;
  url?: string;
  play_count?: number;
  like_count?: number;
  publish_time: string | Date;
}

/**
 * 用户提交动画（录入/勘误/申请删除）—— 走云函数 animationSubmit
 *  - create: 录入新动画
 *  - correct: 勘误（修改标题 + 标签）
 *  - remove:  申请删除（需填理由）
 */
export const SubmissionService = {
  /**
   * 提交前实时校验 bvid 是否已被占用
   */
  async checkBvidUnique(bvid: string): Promise<boolean> {
    if (!bvid || !bvid.trim()) return true;
    try {
      const res = (await CloudService.callFunction('animationSubmit', {
        action: 'checkBvidUnique',
        bvid: bvid.trim(),
      })) as any;
      const result = res?.result as { success?: boolean; data?: { unique?: boolean } };
      return !!(result?.success && result.data?.unique);
    } catch (err) {
      console.warn('[Submission] checkBvidUnique 失败', err);
      return true;
    }
  },

  /**
   * 提交一条新动画（type=create）
   */
  async create(payload: AnimationFormPayload) {
    if (!UserService.openid) throw new Error('未登录');
    const res = (await CloudService.callFunction('animationSubmit', {
      type: 'create',
      payload,
    })) as any;
    const result = res?.result as
      | { success?: boolean; data?: { _id: string; status: number }; error?: string }
      | undefined;
    if (!result?.success) {
      throw new Error(result?.error || '提交失败');
    }
    return result.data;
  },

  /**
   * 勘误：修改标题 + 标签（type=correction）
   * 其他字段保留原状，由管理员通过后合并到 animations
   * @param note 备注（可选，给审核管理员看的补充说明）
   */
  async correct(
    targetId: string,
    payload: { title: string; tag: string; note?: string },
  ) {
    if (!UserService.openid) throw new Error('未登录');
    if (!targetId) throw new Error('缺少原动画 id');
    if (!payload.title?.trim()) throw new Error('标题不能为空');
    if (!payload.tag?.trim()) throw new Error('标签不能为空');
    const note = (payload.note || '').trim().slice(0, 200);
    const res = (await CloudService.callFunction('animationSubmit', {
      type: 'correction',
      target_id: targetId,
      payload: {
        title: payload.title.trim(),
        tag: payload.tag.trim(),
        ...(note ? { note } : {}),
      },
    })) as any;
    const result = res?.result as
      | { success?: boolean; data?: { _id: string; status: number }; error?: string }
      | undefined;
    if (!result?.success) {
      throw new Error(result?.error || '提交失败');
    }
    return result.data;
  },

  /**
   * 申请删除当前视频（type=correction_delete）
   *  - 需传 target_id（原动画 _id）
   *  - 需传 reason（>= 4 字）
   *  - note 备注（可选）
   *  - 管理员通过后从 animations 集合删除
   */
  async remove(targetId: string, reason: string, note?: string) {
    if (!UserService.openid) throw new Error('未登录');
    if (!targetId) throw new Error('缺少原动画 id');
    const trimmed = (reason || '').trim();
    if (trimmed.length < 4) throw new Error('请填写删除理由（至少 4 个字）');
    const noteTrim = (note || '').trim().slice(0, 200);
    const res = (await CloudService.callFunction('animationSubmit', {
      type: 'correction_delete',
      target_id: targetId,
      payload: {
        reason: trimmed,
        ...(noteTrim ? { note: noteTrim } : {}),
      },
    })) as any;
    const result = res?.result as
      | { success?: boolean; data?: { _id: string; status: number }; error?: string }
      | undefined;
    if (!result?.success) {
      throw new Error(result?.error || '提交失败');
    }
    return result.data;
  },

  /** 我的提交/勘误/申请删除记录（status in 2,3） */
  async listMySubmissions(): Promise<Submission[]> {
    if (!UserService.openid) return [];
    try {
      const res = (await CloudService.callFunction('animationMySubmissions', {})) as any;
      const result = res?.result as { success?: boolean; data?: Submission[] };
      return result?.data || [];
    } catch (err) {
      console.error('[Submission] listMySubmissions 失败', err);
      return [];
    }
  },
};

/**
 * 管理员审核 —— 走云函数 animationReview
 */
export const ReviewService = {
  /** 列出待审记录（默认 status=2） */
  async list(
    statusFilter: number[] = [2],
    typeFilter?: SubmissionType[],
  ): Promise<Submission[]> {
    if (!UserService.openid) return [];
    try {
      const res = (await CloudService.callFunction('animationReview', {
        action: 'list',
        statusFilter,
        ...(typeFilter ? { typeFilter } : {}),
      })) as any;
      const result = res?.result as { success?: boolean; data?: Submission[] };
      return result?.data || [];
    } catch (err) {
      console.error('[Review] list 失败', err);
      return [];
    }
  },

  /** 单条详情 */
  async get(id: string): Promise<Submission | null> {
    if (!UserService.openid || !id) return null;
    try {
      const res = (await CloudService.callFunction('animationReview', {
        action: 'get',
        _id: id,
      })) as any;
      const result = res?.result as { success?: boolean; data?: Submission };
      return result?.data || null;
    } catch (err) {
      console.error('[Review] get 失败', err);
      return null;
    }
  },

  /** 通过 */
  async approve(id: string, comment = '') {
    if (!UserService.openid) throw new Error('未登录');
    const res = (await CloudService.callFunction('animationReview', {
      action: 'approve',
      _id: id,
      comment,
    })) as any;
    const result = res?.result as { success?: boolean; error?: string };
    if (!result?.success) throw new Error(result?.error || '审核通过失败');
  },

  /** 驳回（必须填原因） */
  async reject(id: string, comment: string) {
    if (!UserService.openid) throw new Error('未登录');
    if (!comment || !comment.trim()) throw new Error('请填写驳回原因');
    const res = (await CloudService.callFunction('animationReview', {
      action: 'reject',
      _id: id,
      comment: comment.trim(),
    })) as any;
    const result = res?.result as { success?: boolean; error?: string };
    if (!result?.success) throw new Error(result?.error || '驳回失败');
  },
};
