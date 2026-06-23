import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useReachBottom, usePullDownRefresh, useShareAppMessage } from '@tarojs/taro';
import { Rating } from '@/types';
import { RatingService, AnimationService } from '@/services/business';
import { formatTime } from '@/utils/util';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import StarRating from '@/components/StarRating';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

const MyRatingsPage: React.FC = () => {
  const [list, setList] = useState<(Rating & { animTitle?: string; animCover?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  useShareAppMessage(() => ({
    title: '我评过的沙雕动画',
    path: '/pages/my-ratings/index',
  }));

  const load = useCallback(async (p: number, refresh = false) => {
    try {
      if (p === 0) setLoading(true);
      setLoadingMore(p > 0);
      const res = await RatingService.listByUser((p + 1) * PAGE_SIZE);
      // 分页切片
      const start = p * PAGE_SIZE;
      const slice = res.slice(start, start + PAGE_SIZE);

      // 关联动画信息
      const enriched = await Promise.all(
        slice.map(async (r) => {
          try {
            const a = await AnimationService.getById(r.animation_id);
            return { ...r, animTitle: a.title, animCover: a.cover };
          } catch {
            return r;
          }
        }),
      );
      setList((prev) => (p === 0 || refresh ? enriched : [...prev, ...enriched]));
      setHasMore(slice.length >= PAGE_SIZE);
      setPage(p + 1);
    } catch (err) {
      console.error('[MyRatings] 加载失败', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  usePullDownRefresh(async () => {
    setLoading(true);
    await load(0, true);
    Taro.stopPullDownRefresh();
  });

  useReachBottom(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    load(page);
  });

  const goDetail = (id: string) =>
    Taro.navigateTo({ url: `/pages/detail/index?id=${id}` });

  return (
    <View className={styles.pageMyRatings}>
      <Skeleton type="list" loading={loading}>
        {list.length > 0 ? (
          <ScrollView scrollY className={styles.ratingList}>
            {list.map((r) => (
              <View
                key={r._id}
                className={styles.ratingItem}
                onClick={() => goDetail(r.animation_id)}
              >
                <Image
                  className={styles.ratingCover}
                  src={r.animCover || 'https://picsum.photos/id/1/400/300'}
                  mode="aspectFill"
                />
                <View className={styles.ratingInfo}>
                  <Text className={styles.ratingTitle}>
                    {r.animTitle || '已删除的动画'}
                  </Text>
                  <View className={styles.ratingStars}>
                    <StarRating value={r.score} disabled showScore={false} size={24} />
                  </View>
                  <Text className={styles.ratingTime}>
                    {formatTime(r.updated_at)}
                  </Text>
                </View>
              </View>
            ))}
            {hasMore ? (
              <View className={styles.loadMore}>
                <Text>{loadingMore ? '加载中...' : '上拉加载更多'}</Text>
              </View>
            ) : (
              <View className={styles.loadEnd}>
                <Text>— 已经到底了 —</Text>
              </View>
            )}
          </ScrollView>
        ) : (
          !loading && (
            <EmptyState
              icon="⭐"
              title="还没有评分"
              description="去首页给喜欢的动画打个分吧"
              showBtn
              btnText="去首页"
              onAction={() => Taro.reLaunch({ url: '/pages/index/index' })}
            />
          )
        )}
      </Skeleton>
    </View>
  );
};

export default MyRatingsPage;
