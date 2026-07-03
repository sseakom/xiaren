import React, { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Collection } from '@/types';
import { CollectionService } from '@/services/business';
import { formatTime } from '@/utils/util';
import { goDetail, goHome } from '@/utils/nav';
import { usePagination } from '@/hooks/usePagination';
import { toastError } from '@/utils/error';
import AppIcon from '@/components/AppIcon';
import UserMediaList from '@/components/UserMediaList';
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
    path: `/sub-pages/my-collections/index?type=${type}`,
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

      <UserMediaList
        loading={loading}
        items={list.map((c) => ({
          key: c._id,
          cover: c.cover,
          title: c.title || '已删除',
          subtitle: c.up_name,
          meta: c.timeText,
          onClick: () => goDetail({
            bvid: c.animation_bvid || c.bvid || '',
            title: c.title || '',
            cover: c.cover || '',
            up_name: c.up_name || '',
          }),
        }))}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={() => {
          void handleLoadMore();
        }}
        emptyIcon={(
          <AppIcon
            name={type === 'collect' ? 'collectionFilled' : 'watchedFilled'}
            size="100rpx"
          />
        )}
        emptyTitle={type === 'collect' ? '还没有收藏' : '还没看过'}
        emptyDescription={
          type === 'collect'
            ? '在详情页点击收藏，把喜欢的动画收藏起来'
            : '去首页看一些沙雕动画吧'
        }
        emptyShowBtn
        emptyBtnText="去首页"
        onEmptyAction={goHome}
        variant="compact"
      />
    </View>
  );
};

export default MyCollectionsPage;
