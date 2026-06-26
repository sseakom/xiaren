// 业务类型定义

/** 动画实体 - 对应 animations 集合 */
export interface Animation {
  _id: string;
  title: string;
  original_title?: string;
  bvid: string;
  url: string;
  up_name: string;
  cover: string;
  duration: number; // 秒
  play_count: number;
  like_count: number;
  /** 贝叶斯综合评分（0-10） */
  score?: number;
  publish_time: string | Date;
  update_time: string | Date;
  durationText?: string;
  /** 标签（逗号分隔的字符串，如 "沙雕,修仙,爆笑"） */
  tag?: string;
  /** 预 split 后的标签数组（页面渲染时直接 map，避免反复 split） */
  tags?: string[];
  /**
   * 状态字段已废弃：animations 集合不再做上下架/草稿判断，
   * 所有记录默认对外可见，删除走 submissions（type=correction_delete）。
   * 保留可选字段仅为兼容历史数据。
   */
  status?: 0 | 1;
}

/**
 * 动画状态机（在 submissions 集合中使用）
 *  - 1 已应用（管理员已通过；create 已写入 animations，correction 已合并，correction_delete 已删除）
 *  - 2 审核中（管理员待审）
 *  - 3 驳回（管理员驳回）
 */
export type SubmissionStatus = 1 | 2 | 3;

/** 提交类型 */
export type SubmissionType = 'create' | 'correction' | 'correction_delete';

/** 提交人摘要（review 系列云函数联表带回） */
export interface SubmitterInfo {
  nickName: string;
  _id?: string;
}

/**
 * 用户提交记录 - 对应 submissions 集合
 *  - create：用户新增动画，payload 为完整动画字段；通过后写入 animations
 *  - correction：用户勘误，target_bvid 指向原动画，payload 为 { title, tag }；通过后合并
 *  - correction_delete：用户申请删除，target_bvid 指向原动画，payload 为 { reason }；通过后删除动画
 */
export interface Submission {
  _id: string;
  type: SubmissionType;
  /** correction / correction_delete 指向原动画 bvid（业务主键） */
  target_bvid?: string;
  /** create 模式为完整动画字段；correction 模式为 { title, tag }；correction_delete 模式为 { reason } */
  payload: Record<string, any>;
  status: SubmissionStatus;
  submitter_openid: string;
  submitted_at: string | Date;
  reviewer_openid?: string;
  review_time?: string | Date;
  review_comment?: string;
  /** 联表展示（review 系列云函数带回） */
  submitter?: SubmitterInfo;
  /** 联表展示（correction 系列带回原动画摘要） */
  target?: Partial<Animation>;
}

/** 用户提交动画的表单字段（录入） */
export interface AnimationFormPayload {
  title: string;
  original_title?: string;
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

/** 评分实体 - 对应 ratings 集合 */
export interface Rating {
  _id: string;
  user_id: string;
  /** 动画业务主键 */
  animation_bvid: string;
  score: number; // 0-5
  created_at: string | Date;
  updated_at: string | Date;
  timeText?: string;
  // 联表展示（云函数 include_anim=true 时回传）
  animTitle?: string;
  animCover?: string;
  animBvid?: string;
}

/** 收藏实体 - 对应 collections 集合 */
export interface Collection {
  _id: string;
  user_id: string;
  /** 动画业务主键 */
  animation_bvid: string;
  type: 'collect' | 'watched';
  created_at: string | Date;
  timeText?: string;
  // 联表展示
  title?: string;
  up_name?: string;
  cover?: string;
  bvid?: string;
}

/** 用户实体 - 对应 users 集合 */
export interface User {
  _id: string;
  nickName: string;
  avatarUrl: string;
  created_at: string | Date;
  updated_at: string | Date;
  /** 是否管理员；通过云函数 userService.setAdmin 设为 true */
  is_admin?: boolean;
}

/** 用户统计 */
export interface UserStats {
  ratingCount: number;
  collectCount: number;
  watchCount: number;
}

/** 评分分布 */
export type ScoreDistribution = Record<string, number>;
