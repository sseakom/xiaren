import React from 'react';
import { View, Text } from '@tarojs/components';
import styles from './index.module.scss';

export interface LoadMoreFooterProps {
  hasMore: boolean;
  loading: boolean;
  prompt?: string;
  endText?: string;
}

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
