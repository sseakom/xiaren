/**
 * 动画分类筛选配置
 *  - tag 字段为逗号分隔字符串，筛选时按 tag 包含关系匹配
 *  - 分组仅用于 UI 展示，筛选逻辑统一为「tag 包含所选类别」
 */

export interface CategoryGroup {
  /** 分组标题 */
  title: string;
  /** 该分组下的类别（对应 animations 集合 tag 中的某一项） */
  items: string[];
}

/** 全部分类分组（首页 / 搜索页共用） */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    title: '修仙',
    items: ['修仙', '玄幻', '西游', '天庭', '长生', '觉醒'],
  },
  {
    title: '穿越',
    items: ['穿越', '大唐', '大明', '古代', '历史', '大秦', '三国'],
  },
  {
    title: '悬疑',
    items: ['悬疑', '恐怖', '惊悚', '诡异', '推理', '规则', '怪谈', '烧脑'],
  },
  {
    title: '末日',
    items: ['末日', '末世', '丧尸', '求生'],
  },
  {
    title: '科幻',
    items: ['科幻', '异能', '进化'],
  },
  {
    title: '校园',
    items: ['校园', '都市', '恋爱'],
  },
  {
    title: '热血',
    items: ['热血', '战斗', '冒险'],
  },
];

/** 所有类别去重平铺（便于校验 / 快速查找） */
export const ALL_CATEGORIES: string[] = Array.from(
  new Set(CATEGORY_GROUPS.reduce<string[]>((acc, g) => acc.concat(g.items), [])),
);
