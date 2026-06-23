import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Animation, ScoreDistribution } from '@/types';
import {
  AnimationService,
  RatingService,
  CollectionService,
  ScoreService,
} from '@/services/business';
import { UserService } from '@/services/user';
import {
  formatNumber,
  formatTime,
  openBilibili,
} from '@/utils/util';
import StarRating from '@/components/StarRating';
import ScoreChart from '@/components/ScoreChart';
import Skeleton from '@/components/Skeleton';
import StatItem from '@/components/StatItem';
import styles from './index.module.scss';

const DetailPage: React.FC = () => {
  const id = (Taro.getCurrentInstance().router?.params as any)?.id || '';
  const [anim, setAnim] = useState<Animation | null>(null);
  const [loading, setLoading] = useState(true);
  const [myScore, setMyScore] = useState(0);
  const [isCollected, setIsCollected] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [WR, setWR] = useState(0);
  const [R, setR] = useState(0);
  const [distribution, setDistribution] = useState<ScoreDistribution>({});

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 4 个独立云函数，并行拉取：getById / getMyRating / getStatus / calcScore
      const [a, ms, status, sc] = await Promise.all([
        AnimationService.getById(id),
        RatingService.getMyRating(id),
        CollectionService.getStatus(id),
        ScoreService.calc(id),
      ]);
      setAnim(a as Animation);
      setMyScore(ms);
      setIsCollected(status.isCollected);
      setIsWatched(status.isWatched);
      setWR(sc.WR);
      setR(sc.R);
      setDistribution(sc.distribution || {});
    } catch (err) {
      console.error('[Detail] 加载失败', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useShareAppMessage(() => ({
    title: anim?.title ? `《${anim.title}》- 来看看评分` : '沙雕动画',
    path: `/pages/detail/index?id=${id}`,
    imageUrl: anim?.cover || '',
  }));

  const onRate = async (v: number) => {
    if (!UserService.hasLogin) {
      Taro.showToast({ title: '请稍后重试', icon: 'none' });
      return;
    }
    setMyScore(v);
    try {
      const { newRating } = await RatingService.submit(id, v);
      Taro.showToast({
        title: newRating ? '感谢你的评分！' : '已更新评分',
        icon: 'success',
      });
      // 重新拉取分布
      const sc = await ScoreService.calc(id);
      setWR(sc.WR);
      setR(sc.R);
      setDistribution(sc.distribution || {});
    } catch (err) {
      Taro.showToast({ title: '评分失败', icon: 'none' });
    }
  };

  const toggleCollect = async () => {
    if (!UserService.hasLogin) return;
    const next = !isCollected;
    setIsCollected(next);
    try {
      await CollectionService.toggle(id, 'collect', next);
      Taro.showToast({
        title: next ? '已加入收藏' : '已取消收藏',
        icon: 'success',
      });
    } catch (err) {
      setIsCollected(!next);
      Taro.showToast({ title: '操作失败', icon: 'none' });
    }
  };

  const toggleWatched = async () => {
    if (!UserService.hasLogin) return;
    const next = !isWatched;
    setIsWatched(next);
    try {
      await CollectionService.toggle(id, 'watched', next);
    } catch (err) {
      setIsWatched(!next);
    }
  };

  const onOpenBili = () => {
    if (anim?.bvid) openBilibili(anim.bvid);
  };

  if (loading) {
    return (
      <View className={styles.pageDetail}>
        <Skeleton type="detail" loading={true} />
      </View>
    );
  }

  if (!anim) {
    return (
      <View className={styles.pageDetail}>
        <View className={styles.empty}>
          <Text>动画不存在或已下架</Text>
        </View>
      </View>
    );
  }

  return (
    <View className={styles.pageDetail}>
      <ScrollView scrollY className={styles.detailScroll}>
        {/* 封面区 */}
        <View className={styles.coverSection}>
          <Image className={styles.cover} src={anim.cover} mode="aspectFill" />
          <View className={styles.coverMask}>
            <Text className={styles.coverDuration}>{anim.durationText}</Text>
          </View>
        </View>

        {/* 基本信息 */}
        <View className={styles.infoSection}>
          <Text className={styles.title}>{anim.title}</Text>
          <View className={styles.metaRow}>
            <Text className={styles.metaCreator}>UP: {anim.up_name}</Text>
            <Text className={styles.metaTime}>
              {formatTime(anim.publish_time)}
            </Text>
          </View>

          <View className={styles.statsRow}>
            <StatItem
              value={formatNumber(anim.play_count || 0)}
              label="播放"
            />
            <StatItem
              value={formatNumber(anim.like_count || 0)}
              label="点赞"
            />
          </View>
        </View>

        {/* 评分 + 评分分布（左右两列） */}
        <View className={styles.scoreSection}>
          <View className={styles.scoreLayout}>
            {/* 左：WR 综合分 */}
            <View className={styles.scoreColLeft}>
              <View className={styles.scoreMain}>
                <Text className={styles.scoreBig}>{WR.toFixed(1)}</Text>
                <Text className={styles.scoreUnit}>/10</Text>
              </View>
              <Text className={styles.scorePeople}>{R} 人参与</Text>
            </View>

            {/* 中：竖线分隔 */}
            <View className={styles.scoreDivider} />

            {/* 右：评分分布 */}
            <View className={styles.scoreColRight}>
              <ScoreChart distribution={distribution} compact />
            </View>
          </View>
        </View>

        {/* 我的评分（横排） */}
        <View className={styles.myRatingSection}>
          <View className={styles.myRatingRow}>
            <Text className={styles.myRatingTitle}>我的评分</Text>
            <View className={styles.myRatingStars}>
              <StarRating
                value={myScore}
                disabled={false}
                onChange={onRate}
                showScore={false}
                size={40}
              />
            </View>
           <View className={styles.myRatingBadge}>
              <Text className={styles.myRatingBadgeValue}>
                {myScore.toFixed(1)}
              </Text>
            </View>
          </View>
        </View>

        {/* 操作区 */}
        <View className={styles.actionRow}>
          <View
            className={`${styles.actionBtn} ${isCollected ? styles.actionActive : ''}`}
            onClick={toggleCollect}
          >
            <Text className={styles.actionIcon}>
              {isCollected ? '★' : '☆'}
            </Text>
            <Text className={styles.actionText}>
              {isCollected ? '已收藏' : '收藏'}
            </Text>
          </View>

          <View
            className={`${styles.actionBtn} ${isWatched ? styles.actionActive : ''}`}
            onClick={toggleWatched}
          >
            <Text className={styles.actionIcon}>
              {isWatched ? '✓' : '○'}
            </Text>
            <Text className={styles.actionText}>
              {isWatched ? '已看过' : '已看过'}
            </Text>
          </View>

          <View className={styles.actionBtn} onClick={onOpenBili}>
            <Text className={styles.actionIcon}>🔗</Text>
            <Text className={styles.actionText}>复制BVID</Text>
          </View>
        </View>

        <View className={styles.bottomSafe} />
      </ScrollView>
    </View>
  );
};

export default DetailPage;
