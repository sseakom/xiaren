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
  formatDuration,
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
  const [hasRated, setHasRated] = useState(false);
  const [isCollected, setIsCollected] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [WR, setWR] = useState(0);
  const [R, setR] = useState(0);
  const [distribution, setDistribution] = useState<ScoreDistribution>({});

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1) 动画信息
      const a = await AnimationService.getById(id);
      setAnim({ ...a, durationText: formatDuration(a.duration) } as Animation);

      // 2) 我的评分
      const ms = await RatingService.getMyRating(id);
      setMyScore(ms);
      setHasRated(ms > 0);

      // 3) 收藏状态
      const { isCollected: ic, isWatched: iw } =
        await CollectionService.getStatus(id);
      setIsCollected(ic);
      setIsWatched(iw);

      // 4) 评分分布
      const sc = await ScoreService.calc(id);
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
      setHasRated(true);
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

        {/* 评分区 */}
        <View className={styles.scoreSection}>
          <View className={styles.scoreHeader}>
            <View>
              <Text className={styles.scoreBig}>{WR.toFixed(1)}</Text>
              <Text className={styles.scoreUnit}>/10</Text>
            </View>
            <View className={styles.scoreStats}>
              <Text className={styles.scoreText}>贝叶斯综合评分</Text>
              <Text className={styles.scorePeople}>{R} 人参与</Text>
            </View>
          </View>

          <ScoreChart distribution={distribution} />
        </View>

        {/* 我的评分 */}
        <View className={styles.myRatingSection}>
          <Text className={styles.myRatingTitle}>我的评分</Text>
          <View className={styles.myRatingBody}>
            <StarRating
              value={myScore}
              disabled={false}
              onChange={onRate}
              showScore={false}
            />
            <Text className={styles.myRatingHint}>
              {hasRated ? '点击星星修改评分' : '点击星星开始评分'}
            </Text>
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
            <Text className={styles.actionIcon}>▶</Text>
            <Text className={styles.actionText}>B站观看</Text>
          </View>
        </View>

        <View className={styles.bottomSafe} />
      </ScrollView>
    </View>
  );
};

export default DetailPage;
