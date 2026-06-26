import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Collection } from '@/types';
import { CollectionService } from '@/services/business';
import { formatTime } from '@/utils/util';
import { goDetail, goHome } from '@/utils/nav';
import { usePagination } from '@/hooks/usePagination';
import { toastError } from '@/utils/error';
import AppIcon from '@/components/AppIcon';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

type CollectionItem = Collection & { timeText?: string };

const MyCollectionsPage: React.FC = () => {
  // 支持 type=watched 从URL参数读取
  const initialType =
    ((Taro.getCurrentInstance().router?.params as any)?.type as
      | 'collect'
      | 'watched') || 'collect';
  const [type, setType] = useState<'collect' | 'watched'>(initialType);

  const { list, loading, loadingMore, hasMore, handleLoadMore } = usePagination<CollectionItem>(
    async (p) => {
      const { list, total } = await CollectionService.listByUser(
        type,
        p,
        PAGE_SIZE,
        true,
      );
      const enriched: CollectionItem[] = list.map((c) => ({
        ...c,
        timeText: formatTime(c.created_at),
      }));
      return { list: enriched, total };
    },
    [type],
    (err) => toastError('[MyCollections]', err),
  );

  // 切换 type 时同步导航栏标题
  useEffect(() => {
    Taro.setNavigationBarTitle({
      title: type === 'collect' ? '我的收藏' : '我看过的',
    });
  }, [type]);

  useShareAppMessage(() => ({
    title: type === 'watched' ? '我看过的沙雕动画' : '我收藏的沙雕动画',
    path: `/pages/my-collections/index?type=${type}`,
  }));

  return (
    <View className={styles.pageMyCollections}>
      {/* 切换栏 */}
      <View className={styles.tabBar}>
        <View
          className={`${styles.tabItem} ${type === 'collect' ? styles.tabActive : ''}`}
          onClick={() => setType('collect')}
        >
          <Text>收藏</Text>
        </View>
        <View
          className={`${styles.tabItem} ${type === 'watched' ? styles.tabActive : ''}`}
          onClick={() => setType('watched')}
        >
          <Text>已看</Text>
        </View>
      </View>

      <Skeleton type="list" loading={loading}>
        {list.length > 0 ? (
          <ScrollView
            scrollY
            lowerThreshold={80}
            className={styles.collList}
            onScrollToLower={() => {
              void handleLoadMore();
            }}
          >
            {list.map((c) => (
              <View
                key={c._id}
                className={styles.collItem}
                onClick={() => goDetail(c.animation_bvid || c.bvid || '')}
              >
                <Image
                  className={styles.collCover}
                  src={c.cover || 'https://picsum.photos/id/1/400/300'}
                  mode="aspectFill"
                />
                <View className={styles.collInfo}>
                  <Text className={styles.collTitle}>{c.title || '已删除'}</Text>
                  <Text className={styles.collCreator}>{c.up_name}</Text>
                  <Text className={styles.collTime}>{c.timeText}</Text>
                </View>
                <View className={styles.collArrow}>
                  <AppIcon name="arrowRight" size="20rpx" />
                </View>
              </View>
            ))}
            <LoadMoreFooter hasMore={hasMore} loading={loadingMore} />
          </ScrollView>
        ) : (
          !loading && (
            <EmptyState
              icon={(
                <AppIcon
                  name={type === 'collect' ? 'collectionFilled' : 'watchedFilled'}
                  size="100rpx"
                />
              )}
              title={type === 'collect' ? '还没有收藏' : '还没看过'}
              description={
                type === 'collect'
                  ? '在详情页点击收藏，把喜欢的动画收藏起来'
                  : '去首页看一些沙雕动画吧'
              }
              showBtn
              btnText="去首页"
              onAction={goHome}
            />
          )
        )}
      </Skeleton>
    </View>
  );
};

export default MyCollectionsPage;
