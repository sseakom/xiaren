import { Submission, SubmissionType } from '@/types';

/**
 * 提交记录（Submission）相关通用逻辑
 * 消除 my-submissions / review-list / review-detail 三个页面中重复的
 *  - TYPE_LABEL / TYPE_COLOR 常量
 *  - 根据 type 从 payload 或 target 提取展示字段的逻辑
 */

/** 提交类型 → 中文标签（简短，列表项用） */
export const SUBMISSION_TYPE_LABEL: Record<SubmissionType, string> = {
  create: '录入',
  correction: '勘误',
  correction_delete: '申请删除',
};

/** 提交类型 → 样式 class 名（对应各页 module.scss） */
export const SUBMISSION_TYPE_COLOR: Record<SubmissionType, string> = {
  create: 'typeCreate',
  correction: 'typeCorrection',
  correction_delete: 'typeDelete',
};

/** Submission 展示用的派生字段 */
export interface SubmissionDisplay {
  title: string;
  cover?: string;
  upName?: string;
  bvid?: string;
  duration?: number;
  playCount?: number;
  likeCount?: number;
  tag?: string;
  url?: string;
  publishTime?: any;
}

/**
 * 根据 submission.type 从 payload（create）或 target（correction / correction_delete）
 * 统一提取展示字段，消除三处页面里重复的三元判断。
 */
export function getSubmissionDisplay(it: Submission): SubmissionDisplay {
  const isCreate = it.type === 'create';
  const payload: any = it.payload || {};
  const target: any = it.target || {};

  const title = isCreate
    ? payload.title || '未命名'
    : it.type === 'correction'
      ? payload.title || target.title || '勘误'
      : target.title || '申请删除';

  const cover = isCreate ? payload.cover : target.cover;
  const upName = isCreate ? payload.up_name : target.up_name;
  const bvid = isCreate ? payload.bvid : target.bvid;
  const duration = isCreate
    ? Number(payload.duration) || 0
    : Number(target.duration) || 0;

  return {
    title,
    cover,
    upName,
    bvid,
    duration,
    playCount: isCreate ? payload.play_count : undefined,
    likeCount: isCreate ? payload.like_count : undefined,
    tag: isCreate
      ? payload.tag
      : it.type === 'correction'
        ? payload.tag
        : undefined,
    url: isCreate
      ? payload.url || (payload.bvid ? `https://www.bilibili.com/video/${payload.bvid}` : '')
      : target.bvid
        ? `https://www.bilibili.com/video/${target.bvid}`
        : '',
    publishTime: isCreate ? payload.publish_time : undefined,
  };
}
