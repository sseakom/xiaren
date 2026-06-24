import React from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import { useShareAppMessage } from '@tarojs/taro';
import { Rating } from '@/types';
import { RatingService } from '@/services/business';
import { formatTime } from '@/utils/util';
import { goDetail, goHome } from '@/utils/nav';
import { usePagination } from '@/hooks/usePagination';
import { toastError } from '@/utils/error';
import EmptyState from '@/components/EmptyState';
import Skeleton from '@/components/Skeleton';
import StarRating from '@/components/StarRating';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

const MyRatingsPage: React.FC = () => {
  const { list, loading, loadingMore, hasMore } = usePagination<Rating>(
    async (p) => {
      const { list, total } = await RatingService.listByUser(p, PAGE_SIZE, true);
      return { list, total };
    },
    [],
    (err) => toastError('[MyRatings]', err),
  );

  useShareAppMessage(() => ({
    title: '我评过的沙雕动画',
    path: '/pages/my-ratings/index',
  }));

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
            <LoadMoreFooter hasMore={hasMore} loading={loadingMore} />
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
