import React from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import AppIcon from '@/components/AppIcon';
import styles from './index.module.scss';

export type UserMediaListVariant = 'default' | 'compact';

export interface UserMediaListItem {
  key: string;
  cover?: string;
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  extra?: React.ReactNode;
  onClick?: () => void;
  rightSlot?: React.ReactNode;
}

export interface UserMediaListProps {
  loading: boolean;
  items: UserMediaListItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyIcon?: React.ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  emptyShowBtn?: boolean;
  emptyBtnText?: string;
  onEmptyAction?: () => void;
  variant?: UserMediaListVariant;
  coverFallback?: string;
}

const FALLBACK_COVER = 'https://picsum.photos/id/1/400/300';

const UserMediaList: React.FC<UserMediaListProps> = ({
  loading,
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyIcon,
  emptyTitle,
  emptyDescription = '',
  emptyShowBtn = false,
  emptyBtnText = '去首页',
  onEmptyAction,
  variant = 'default',
  coverFallback = FALLBACK_COVER,
}) => {
  const isCompact = variant === 'compact';

  return (
    <Skeleton type="list" loading={loading}>
      {items.length > 0 ? (
        <ScrollView
          scrollY
          lowerThreshold={80}
          className={styles.list}
          onScrollToLower={() => {
            onLoadMore();
          }}
        >
          {items.map((item) => (
            <View
              key={item.key}
              className={`${styles.item} ${isCompact ? styles.itemCompact : ''}`}
              onClick={item.onClick}
            >
              <Image
                className={`${styles.cover} ${isCompact ? styles.coverCompact : ''}`}
                src={item.cover || coverFallback}
                mode="aspectFill"
              />
              <View className={styles.info}>
                <Text className={`${styles.title} ${isCompact ? styles.titleCompact : ''}`}>
                  {item.title}
                </Text>
                {item.subtitle ? <View className={styles.subtitle}>{item.subtitle}</View> : null}
                {item.extra ? <View className={styles.extra}>{item.extra}</View> : null}
                {item.meta ? <View className={styles.meta}>{item.meta}</View> : null}
              </View>
              {item.rightSlot ?? (isCompact ? (
                <View className={styles.arrow}>
                  <AppIcon name="arrowRight" size="20rpx" />
                </View>
              ) : null)}
            </View>
          ))}
          <LoadMoreFooter hasMore={hasMore} loading={loadingMore} />
        </ScrollView>
      ) : (
        !loading && (
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            showBtn={emptyShowBtn}
            btnText={emptyBtnText}
            onAction={onEmptyAction}
          />
        )
      )}
    </Skeleton>
  );
};

export default UserMediaList;
