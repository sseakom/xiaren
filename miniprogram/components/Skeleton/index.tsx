import React from 'react';
import { View } from '@tarojs/components';
import { Skeleton as NutSkeleton } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/skeleton/style/style.css';
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
            <NutSkeleton
              width="100%"
              height="340rpx"
              animated
              shape="square"
            />
            <View className={styles.skeletonCardBody}>
              <NutSkeleton
                width="80%"
                height="36rpx"
                animated
                shape="round"
              />
              <View style={{ marginTop: '16rpx' }}>
                <NutSkeleton
                  width="60%"
                  height="24rpx"
                  animated
                  shape="round"
                />
              </View>
              <View style={{ marginTop: '16rpx' }}>
                <NutSkeleton
                  width="100%"
                  height="24rpx"
                  animated
                  shape="round"
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (type === 'detail') {
    return (
      <View className={styles.skeleton}>
        <NutSkeleton
          width="100%"
          height="400rpx"
          animated
          shape="square"
        />
        <View style={{ marginTop: '24rpx' }}>
          <NutSkeleton
            width="100%"
            height="36rpx"
            animated
            shape="round"
          />
        </View>
        <View style={{ marginTop: '16rpx' }}>
          <NutSkeleton
            width="100%"
            height="24rpx"
            animated
            shape="round"
          />
        </View>
        <View style={{ marginTop: '16rpx' }}>
          <NutSkeleton
            width="60%"
            height="24rpx"
            animated
            shape="round"
          />
        </View>
      </View>
    );
  }

  if (type === 'list') {
    return (
      <View className={styles.skeleton}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} className={styles.skeletonListItem}>
            <NutSkeleton
              width="80rpx"
              height="80rpx"
              animated
              shape="circle"
            />
            <View className={styles.skeletonListContent}>
              <NutSkeleton
                width="60%"
                height="36rpx"
                animated
                shape="round"
              />
              <View style={{ marginTop: '16rpx' }}>
                <NutSkeleton
                  width="100%"
                  height="24rpx"
                  animated
                  shape="round"
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className={styles.skeleton}>
      <NutSkeleton
        width={`${width}%`}
        height={`${height}rpx`}
        animated
        shape={radius > 50 ? 'circle' : 'round'}
      />
    </View>
  );
};

export default Skeleton;
