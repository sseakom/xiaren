import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

export interface StatItemProps {
  /** 数值（已格式化好的字符串） */
  value: string | number;
  /** 标签，如 "播放" / "点赞" / "我的评分" */
  label: string;
  /** 点击回调（用于个人中心入口等） */
  onClick?: () => void;
  /** 是否靠左对齐（紧凑布局用，默认 false = 上下结构） */
  inline?: boolean;
}

/**
 * 数字+标签 统计项
 * - inline=false（默认）：上下结构（value 大、label 小） —— 详情/搜索/列表卡片用
 * - inline=true：左右结构（label 小、value 在前） —— 个人中心入口用
 */
const StatItem: React.FC<StatItemProps> = ({ value, label, onClick, inline = false }) => {
  return (
    <View
      className={classnames(styles.statItem, { [styles.inline]: inline })}
      onClick={onClick}
    >
      <Text className={styles.statValue}>{value}</Text>
      <Text className={styles.statLabel}>{label}</Text>
    </View>
  );
};

export default StatItem;
