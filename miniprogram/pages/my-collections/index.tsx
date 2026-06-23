import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useReachBottom, usePullDownRefresh, useShareAppMessage } from '@tarojs/taro';
import { Collection } from '@/types';
import { CollectionService } from '@/services/business';
import { formatTime } from '@/utils/util';
import { goHome } from '@/utils/nav';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

const MyCollectionsPage: React.FC = () => {
  // 支持 type=watched 从URL参数读取
  const initialType =
    ((Taro.getCurrentInstance().router?.params as any)?.type as
      | 'collect'
      | 'watched') || 'collect';
  const [type, setType] = useState<'collect' | 'watched'>(initialType);
  // 列表项附带派生字段 timeText，单独扩展类型以避免 setState 类型不匹配
  type CollectionItem = Collection & { timeText?: string };
  const [list, setList] = useState<CollectionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);

  useShareAppMessage(() => ({
    title:
      type === 'watched' ? '我看过的沙雕动画' : '我收藏的沙雕动画',
    path: `/pages/my-collections/index?type=${type}`,
  }));

  const load = useCallback(
    async (p: number, t: 'collect' | 'watched', refresh = false) => {
      try {
        if (p === 0) setLoading(true);
        setLoadingMore(p > 0);
        // include_anim=true：云函数一次性返回 title/up_name/cover，去掉 N+1
        const { list: data, total: cnt } = await CollectionService.listByUser(
          t,
          p,
          PAGE_SIZE,
          true,
        );
        const enriched: CollectionItem[] = data.map((c) => ({
          ...c,
          timeText: formatTime(c.created_at),
        }));
        setList((prev) => (p === 0 || refresh ? enriched : [...prev, ...enriched]));
        setTotal(cnt);
        setPage(p + 1);
      } catch (err) {
        console.error('[MyCollections] 加载失败', err);
        Taro.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    setList([]);
    setPage(0);
    setTotal(0);
    load(0, type);
    // 设置导航栏标题
    Taro.setNavigationBarTitle({
      title: type === 'collect' ? '我的收藏' : '我看过的',
    });
  }, [load, type]);

  usePullDownRefresh(async () => {
    setLoading(true);
    await load(0, type, true);
    Taro.stopPullDownRefresh();
  });

  useReachBottom(() => {
    if (loadingMore || loading) return;
    if (list.length >= total) return;
    setLoadingMore(true);
    load(page, type);
  });

  const goDetail = (id: string) =>
    Taro.navigateTo({ url: `/pages/detail/index?id=${id}` });

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
          <ScrollView scrollY className={styles.collList}>
            {list.map((c) => (
              <View
                key={c._id}
                className={styles.collItem}
                onClick={() => goDetail(c.animation_id)}
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
                  <Text>›</Text>
                </View>
              </View>
            ))}
            <LoadMoreFooter
              hasMore={list.length < total}
              loading={loadingMore}
            />
          </ScrollView>
        ) : (
          !loading && (
            <EmptyState
              icon={type === 'collect' ? '★' : '✓'}
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
