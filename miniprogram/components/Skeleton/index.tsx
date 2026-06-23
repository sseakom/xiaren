import React from 'react';
import { View } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

export interface SkeletonProps {
  loading?: boolean;
  type?: 'card' | 'detail' | 'list' | 'custom';
  height?: number;
  width?: number;
  radius?: number;
  children?: React.ReactNode;
}

const Skeleton: React.FC<SkeletonProps> = ({
  loading = true,
  type = 'card',
  height = 40,
  width = 100,
  radius = 8,
  children,
}) => {
  if (!loading) return <>{children}</>;

  if (type === 'card') {
    return (
      <View className={styles.skeleton}>
        {[1, 2, 3].map((i) => (
          <View key={i} className={styles.skeletonCard}>
            <View className={classnames(styles.skeletonRow, styles.skeletonCover)} />
            <View className={styles.skeletonCardBody}>
              <View className={classnames(styles.skeletonRow, styles.skeletonTitle)} />
              <View className={classnames(styles.skeletonRow, styles.skeletonText, styles.short)} />
              <View className={classnames(styles.skeletonRow, styles.skeletonText)} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (type === 'detail') {
    return (
      <View className={styles.skeleton}>
        <View className={styles.skeletonDetail}>
          <View className={classnames(styles.skeletonRow, styles.skeletonCoverLarge)} />
          <View className={classnames(styles.skeletonRow, styles.skeletonTitle)} />
          <View className={classnames(styles.skeletonRow, styles.skeletonText)} />
          <View className={classnames(styles.skeletonRow, styles.skeletonText, styles.short)} />
        </View>
      </View>
    );
  }

  if (type === 'list') {
    return (
      <View className={styles.skeleton}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} className={styles.skeletonListItem}>
            <View className={classnames(styles.skeletonRow, styles.skeletonAvatar)} />
            <View className={styles.skeletonListContent}>
              <View className={classnames(styles.skeletonRow, styles.skeletonTitle, styles.short)} />
              <View className={classnames(styles.skeletonRow, styles.skeletonText)} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className={styles.skeleton}>
      <View
        className={styles.skeletonRow}
        style={{
          height: `${height}rpx`,
          width: `${width}%`,
          borderRadius: `${radius}rpx`,
        }}
      />
    </View>
  );
};

export default Skeleton;
