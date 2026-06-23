import React from 'react';
import { View, Text } from '@tarojs/components';
import styles from './index.module.scss';

export interface LoadMoreFooterProps {
  /** 是否还有更多数据 */
  hasMore: boolean;
  /** 是否正在加载中 */
  loading: boolean;
  /** 加载提示文字（"上拉加载更多" / "点击加载更多"） */
  prompt?: string;
  /** 已加载完毕提示 */
  endText?: string;
}

/**
 * 列表分页底部：
 *   - 有更多：loading=true 显示"加载中..."，否则显示 prompt
 *   - 无更多：显示 endText
 */
const LoadMoreFooter: React.FC<LoadMoreFooterProps> = ({
  hasMore,
  loading,
  prompt = '上拉加载更多',
  endText = '— 已经到底了 —',
}) => {
  if (!hasMore) {
    return (
      <View className={styles.loadEnd}>
        <Text>{endText}</Text>
      </View>
    );
  }
  return (
    <View className={styles.loadMore}>
      <Text>{loading ? '加载中...' : prompt}</Text>
    </View>
  );
};

export default LoadMoreFooter;
