import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useReachBottom, usePullDownRefresh, useShareAppMessage } from '@tarojs/taro';
import { Rating } from '@/types';
import { RatingService } from '@/services/business';
import { formatTime } from '@/utils/util';
import { goDetail, goHome } from '@/utils/nav';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import StarRating from '@/components/StarRating';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

const MyRatingsPage: React.FC = () => {
  const [list, setList] = useState<Rating[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);

  useShareAppMessage(() => ({
    title: '我评过的沙雕动画',
    path: '/pages/my-ratings/index',
  }));

  const load = useCallback(async (p: number, refresh = false) => {
    try {
      if (p === 0) setLoading(true);
      setLoadingMore(p > 0);
      // include_anim=true：云函数一次性回传 animTitle/animCover，去掉 N+1
      const { list: data, total: cnt } = await RatingService.listByUser(
        p,
        PAGE_SIZE,
        true,
      );
      setList((prev) => (p === 0 || refresh ? data : [...prev, ...data]));
      setTotal(cnt);
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
    if (loadingMore || loading) return;
    if (list.length >= total) return;
    setLoadingMore(true);
    load(page);
  });

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
            <LoadMoreFooter
              hasMore={list.length < total}
              loading={loadingMore}
            />
          </ScrollView>
        ) : (
          !loading && (
            <EmptyState
              icon="⭐"
              title="还没有评分"
              description="去首页给喜欢的动画打个分吧"
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

export default MyRatingsPage;
