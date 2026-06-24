// 业务类型定义

/** 动画实体 - 对应 animations 集合 */
export interface Animation {
  _id: string;
  title: string;
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
}

/**
 * 动画状态机
 *  - 0 草稿（预留，暂未使用）
 *  - 1 已发布（默认；首页/搜索能查到）
 *  - 2 审核中（用户提交的新动画/勘误；首页/搜索不可见）
 *  - 3 驳回（首页/搜索不可见；用户可在《我的提交》看到）
 */
export type AnimationStatus = 0 | 1 | 2 | 3;

/** 动画提交记录（在 animations 集合中带审核相关字段） */
export interface AnimationSubmission extends Animation {
  /** 状态：2 审核中 / 3 驳回 / 1 已发布 */
  status: AnimationStatus;
  /** 提交人 openid */
  submitter_openid?: string;
  /** 提交时间 */
  submitted_at?: string | Date;
  /** 审核人 openid */
  reviewer_openid?: string;
  /** 审核时间 */
  review_time?: string | Date;
  /** 审核/驳回备注（如驳回原因） */
  review_comment?: string;
  /** 勘误来源：如果是勘误记录，指向原动画的 _id */
  correction_of?: string;
}

/** 评分实体 - 对应 ratings 集合 */
export interface Rating {
  _id: string;
  user_id: string;
  animation_id: string;
  score: number; // 0-5
  created_at: string | Date;
  updated_at: string | Date;
  timeText?: string;
  // 联表展示（云函数 include_anim=true 时回传）
  animTitle?: string;
  animCover?: string;
}

/** 收藏实体 - 对应 collections 集合 */
export interface Collection {
  _id: string;
  user_id: string;
  animation_id: string;
  type: 'collect' | 'watched';
  created_at: string | Date;
  timeText?: string;
  // 联表展示
  title?: string;
  up_name?: string;
  cover?: string;
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
}

/** 评分分布 */
export type ScoreDistribution = Record<string, number>;
