import React from 'react';
import { View } from '@tarojs/components';
import { useShareAppMessage } from '@tarojs/taro';
import { Rating } from '@/types';
import { RatingService } from '@/services/business';
import { formatTime } from '@/utils/util';
import { goDetail, goHome } from '@/utils/nav';
import { usePagination } from '@/hooks/usePagination';
import { toastError } from '@/utils/error';
import AppIcon from '@/components/AppIcon';
import StarRating from '@/components/StarRating';
import UserMediaList from '@/components/UserMediaList';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

const MyRatingsPage: React.FC = () => {
  const { list, loading, loadingMore, hasMore, handleLoadMore } = usePagination<Rating>(
    async (p) => {
      const { list, total } = await RatingService.listByUser(p, PAGE_SIZE, true);
      return { list, total };
    },
    [],
    (err) => toastError('[MyRatings]', err),
  );

  useShareAppMessage(() => ({
    title: '我评过的沙雕动画',
    path: '/sub-pages/my-ratings/index',
  }));

  return (
    <View className={styles.pageMyRatings}>
      <UserMediaList
        loading={loading}
        items={list.map((r) => ({
          key: r._id,
          cover: r.animCover,
          title: r.animTitle || '已删除的动画',
          extra: <StarRating value={r.score} disabled showScore={false} size={24} />,
          meta: formatTime(r.updated_at),
          onClick: () => goDetail({
            bvid: r.animation_bvid || r.animBvid || '',
            title: r.animTitle || '',
            cover: r.animCover || '',
          }),
        }))}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={() => {
          void handleLoadMore();
        }}
        emptyIcon={<AppIcon name="rating" size="100rpx" />}
        emptyTitle="还没有评分"
        emptyDescription="去首页给喜欢的动画打个分吧"
        emptyShowBtn
        emptyBtnText="去首页"
        onEmptyAction={goHome}
      />
    </View>
  );
};

export default MyRatingsPage;
