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
}

/** 用户统计 */
export interface UserStats {
  ratingCount: number;
  collectCount: number;
}

/** 评分分布 */
export type ScoreDistribution = Record<string, number>;
