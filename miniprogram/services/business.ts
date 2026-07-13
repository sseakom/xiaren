import { CloudService } from './cloud';
import { AnimationDatasetService } from './animationDataset';
import {
  enrichCollectionsWithAnimations,
  enrichRatingsWithAnimations,
  enrichSubmissionsWithTargets,
} from './animationJoinAdapter';
import {
  adaptCloudListResult,
  createEmptyListResult,
  ListResult,
} from './cloudListAdapter';
import {
  normalizeOptionalNote,
  requireTrimmedText,
  trimText,
} from './serviceHelpers';
import {
  Rating,
  Collection,
  ScoreDistribution,
  Submission,
  SubmissionType,
  AnimationFormPayload,
} from '@/types';
import { UserService } from './user';

/**
 * 业务服务层 —— 所有查询 / 修改全部走云函数，云函数内部操作数据库。
 * 客户端不持有 db 实例，DB 入口已从 CloudService 类型层移除。
 *
 * 重构说明：
 *  - 查询类方法统一用 CloudService.callCloudSafe（失败降级返回空，不抛错）
 *  - 操作类方法统一用 CloudService.callCloud（失败抛 Error 给上层 toast）
 *  - AnimationFormPayload 复用 @/types 定义，不再重复声明
 */

/** 列表排序方式 */
export type ListSort =
  | 'publish_time'
  | 'play_count_asc'
  | 'play_count_desc'
  | 'danmaku_count_asc'
  | 'danmaku_count_desc'
  | 'duration_asc'
  | 'duration_desc'
  | 'score_asc'
  | 'score_desc';

// 向后兼容：保留 AnimationFormPayload 的 re-export
export type { AnimationFormPayload };

async function loadAnimationMapByBvids(bvids: string[]) {
  return AnimationDatasetService.getMapByBvids(bvids);
}

function requireLogin() {
  if (!UserService.openid) {
    throw new Error('未登录');
  }
}

/**
 * 动画业务服务
 *  - list       → 本地全量快照 + 前端分页/排序
 *  - getByBvid  → 本地全量快照按 bvid 读取
 *  - search     → 本地全量快照 + 前端模糊搜索
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
    return AnimationDatasetService.listPage(
      page,
      pageSize,
      sortBy,
      category,
    );
  },

  /** 获取单个动画详情（按 bvid） */
  async getByBvid(bvid: string) {
    return AnimationDatasetService.getByBvid(bvid);
  },

  /**
   * 模糊搜索（按标题、UP主、tag）
   *  - 启动时同步一份精简全量快照到前端
   *  - 搜索页直接在本地做 fuzzyScore 排序 + 分页
   *  - 传 sortBy 时按指定字段排序（先 fuzzy 过滤再排序），否则按相关度
   */
  async search(
    keyword: string,
    page = 0,
    pageSize = 20,
    category = '',
    sortBy?: ListSort,
  ): Promise<ListResult> {
    const trimmedKeyword = trimText(keyword);
    if (!trimmedKeyword) {
      return createEmptyListResult();
    }
    return AnimationDatasetService.searchPage(
      trimmedKeyword,
      page,
      pageSize,
      category,
      sortBy,
    );
  },
};

/**
 * 评分业务
 *  - 全部走云函数 rating（action: get / submit / listMy）
 */
export const RatingService = {
  /** 获取用户对某动画的评分 */
  async getMyRating(animationBvid: string): Promise<number> {
    if (!UserService.openid) return 0;
    const r = await CloudService.callCloudSafe('rating', {
      action: 'get',
      animation_bvid: animationBvid,
    });
    return r ? r.score || 0 : 0;
  },

  /** 提交评分；云函数内部会自动触发 calcScore 聚合 */
  async submit(animationBvid: string, score: number): Promise<{ newRating: boolean }> {
    requireLogin();
    const r = await CloudService.callCloud('rating', {
      action: 'submit',
      animation_bvid: animationBvid,
      score,
    });
    return { newRating: !!r.newRating };
  },

  /** 获取用户全部评分（带分页 + 关联动画信息） */
  async listByUser(
    page = 0,
    pageSize = 20,
    includeAnim = false,
  ): Promise<{ list: Rating[]; total: number }> {
    if (!UserService.openid) return createEmptyListResult();
    const result = adaptCloudListResult<Rating>(
      await CloudService.callCloudSafe('rating', {
      action: 'listMy',
      limit: pageSize,
      offset: page * pageSize,
      include_anim: false,
      }),
    );
    result.list = await enrichRatingsWithAnimations(result.list, includeAnim, loadAnimationMapByBvids);
    return result;
  },
};

/**
 * 收藏 / 看过 业务
 *  - 全部走云函数 collection（action: getStatus / toggle / listMy）
 */
export const CollectionService = {
  async getStatus(animationBvid: string): Promise<{ isCollected: boolean; isWatched: boolean }> {
    if (!UserService.openid) return { isCollected: false, isWatched: false };
    const r = await CloudService.callCloudSafe('collection', {
      action: 'getStatus',
      animation_bvid: animationBvid,
    });
    if (!r) return { isCollected: false, isWatched: false };
    return { isCollected: !!r.isCollected, isWatched: !!r.isWatched };
  },

  async toggle(
    animationBvid: string,
    type: 'collect' | 'watched',
    add: boolean,
  ): Promise<{ isCollected: boolean; isWatched: boolean }> {
    requireLogin();
    const r = await CloudService.callCloud('collection', {
      action: 'toggle',
      animation_bvid: animationBvid,
      type,
      add,
    });
    return { isCollected: !!r.isCollected, isWatched: !!r.isWatched };
  },

  async listByUser(
    type: 'collect' | 'watched',
    page = 0,
    pageSize = 20,
    includeAnim = false,
  ): Promise<{ list: Collection[]; total: number }> {
    if (!UserService.openid) return createEmptyListResult();
    const result = adaptCloudListResult<Collection>(
      await CloudService.callCloudSafe('collection', {
      action: 'listMy',
      type,
      limit: pageSize,
      offset: page * pageSize,
      include_anim: false,
      }),
    );
    result.list = await enrichCollectionsWithAnimations(result.list, includeAnim, loadAnimationMapByBvids);
    return result;
  },
};

/** 评分分布（贝叶斯计算）—— 走云函数 calcScore */
export const ScoreService = {
  async calc(animationBvid: string): Promise<{
    WR: number;
    R: number;
    v: number;
    C: number;
    distribution: ScoreDistribution;
  }> {
    const r = await CloudService.callCloudSafe('calcScore', {
      animation_bvid: animationBvid,
    });
    if (!r) return { WR: 0, R: 0, v: 0, C: 3.5, distribution: {} };
    return {
      WR: r.WR || 0,
      R: r.R || 0,
      v: r.v || 0,
      C: r.C || 3.5,
      distribution: r.distribution || {},
    };
  },
};

/**
 * B 站视频信息抓取服务
 *  - fetchByBvid: 从云函数 bilibiliFetch 拉取视频元信息
 *  - 不直接调 B 站 API（避免 CORS、UA/Referer、限流等），由云端代理
 */
export interface BilibiliVideoInfo {
  bvid: string;
  title: string;
  original_title: string;
  cover: string;
  up_name: string;
  duration: number; // 秒
  play_count: number;
  like_count: number;
  publish_time: string; // YYYY-MM-DDTHH:mm:ss
  url: string;
  /** B 站官方 tag（来自 /x/tag/archive/tags） */
  tags?: string[];
}

export const BilibiliService = {
  /**
   * 拉取 B 站视频元信息（云端代理请求 api.bilibili.com）
   * @param input bvid 字符串 / 完整 B 站视频 URL / b23.tv 短链
   */
  async fetchByBvid(input: string): Promise<BilibiliVideoInfo> {
    const raw = (input || '').trim();
    if (!raw) throw new Error('请输入 bvid 或包含 bvid 的链接');
    try {
      const r = await CloudService.callCloud('bilibiliFetch', { bvid: raw });
      if (!r.data) throw new Error('B 站信息拉取失败');
      return r.data as BilibiliVideoInfo;
    } catch (err: any) {
      console.error('[Bilibili] fetchByBvid 失败', err);
      throw new Error(err?.message || 'B 站信息拉取失败');
    }
  },
};

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
    const trimmedBvid = trimText(bvid);
    if (!trimmedBvid) return true;
    const existing = await AnimationDatasetService.getByBvid(trimmedBvid);
    if (existing) return false;
    const r = await CloudService.callCloudSafe('animationSubmit', {
      action: 'checkBvidUnique',
      bvid: trimmedBvid,
    });
    return !!(r && r.data?.unique);
  },

  /**
   * 提交一条新动画（type=create）
   */
  async create(payload: AnimationFormPayload) {
    requireLogin();
    const r = await CloudService.callCloud('animationSubmit', {
      type: 'create',
      payload,
    });
    return r.data;
  },

  /**
   * 勘误：修改标题 + 标签（type=correction）
   * 其他字段保留原状，由管理员通过后合并到 animations
   * @param note 备注（可选，给审核管理员看的补充说明）
   */
  async correct(
    targetBvid: string,
    payload: { title: string; tag: string; note?: string },
  ) {
    requireLogin();
    const nextTargetBvid = requireTrimmedText(targetBvid, '缺少原动画 bvid');
    const targetAnim = await AnimationDatasetService.getByBvid(nextTargetBvid);
    if (!targetAnim) throw new Error('原动画不存在');
    const title = requireTrimmedText(payload.title, '标题不能为空');
    const tag = requireTrimmedText(payload.tag, '标签不能为空');
    const note = normalizeOptionalNote(payload.note);
    const r = await CloudService.callCloud('animationSubmit', {
      type: 'correction',
      target_bvid: nextTargetBvid,
      payload: {
        title,
        tag,
        ...(note ? { note } : {}),
      },
    });
    return r.data;
  },

  /**
   * 申请删除当前视频（type=correction_delete）
   *  - 需传 target_bvid（原动画 bvid）
   *  - 需传 reason（>= 4 字）
   *  - note 备注（可选）
   *  - 管理员通过后从 animations 集合删除
   */
  async remove(targetBvid: string, reason: string, note?: string) {
    requireLogin();
    const nextTargetBvid = requireTrimmedText(targetBvid, '缺少原动画 bvid');
    const targetAnim = await AnimationDatasetService.getByBvid(nextTargetBvid);
    if (!targetAnim) throw new Error('原动画不存在');
    const trimmedReason = trimText(reason);
    if (trimmedReason.length < 4) throw new Error('请填写删除理由（至少 4 个字）');
    const noteTrim = normalizeOptionalNote(note);
    const r = await CloudService.callCloud('animationSubmit', {
      type: 'correction_delete',
      target_bvid: nextTargetBvid,
      payload: {
        reason: trimmedReason,
        ...(noteTrim ? { note: noteTrim } : {}),
      },
    });
    return r.data;
  },

  /** 我的提交/勘误/申请删除记录（status in 2,3） */
  async listMySubmissions(): Promise<Submission[]> {
    if (!UserService.openid) return [];
    const r = await CloudService.callCloudSafe('animationMySubmissions', {});
    return enrichSubmissionsWithTargets((r?.data as Submission[]) || [], loadAnimationMapByBvids);
  },

  /**
   * 主动取消自己的提交（仅 status=2 审核中可取消）
   * @returns 成功返回被删除的 _id
   */
  async cancel(_id: string): Promise<{ _id: string } | null> {
    requireLogin();
    const submissionId = requireTrimmedText(_id, '缺少 _id');
    const r = await CloudService.callCloud('animationSubmit', {
      action: 'cancel',
      _id: submissionId,
    });
    return r.data || null;
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
    const r = await CloudService.callCloudSafe('animationReview', {
      action: 'list',
      statusFilter,
      ...(typeFilter ? { typeFilter } : {}),
    });
    return enrichSubmissionsWithTargets((r?.data as Submission[]) || [], loadAnimationMapByBvids);
  },

  /** 单条详情 */
  async get(id: string): Promise<Submission | null> {
    if (!UserService.openid || !id) return null;
    const r = await CloudService.callCloudSafe('animationReview', {
      action: 'get',
      _id: id,
    });
    const item = (r?.data as Submission) || null;
    if (!item) return null;
    const [enriched] = await enrichSubmissionsWithTargets([item], loadAnimationMapByBvids);
    return enriched || item;
  },

  /** 通过 */
  async approve(id: string, comment = '') {
    requireLogin();
    await CloudService.callCloud('animationReview', {
      action: 'approve',
      _id: id,
      comment,
    });
  },

  /** 驳回（必须填原因） */
  async reject(id: string, comment: string) {
    requireLogin();
    await CloudService.callCloud('animationReview', {
      action: 'reject',
      _id: id,
      comment: requireTrimmedText(comment, '请填写驳回原因'),
    });
  },
};
