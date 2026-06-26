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
  formatDuration,
  copyText,
} from '@/utils/util';
import { toastError } from '@/utils/error';
import AppIcon from '@/components/AppIcon';
import RatingRow from '@/components/RatingRow';
import ScoreChart from '@/components/ScoreChart';
import Skeleton from '@/components/Skeleton';
import TagRow from '@/components/TagRow';
import styles from './index.module.scss';

const DetailPage: React.FC = () => {
  const id = (Taro.getCurrentInstance().router?.params as any)?.id || '';
  const [anim, setAnim] = useState<Animation | null>(null);
  const [loading, setLoading] = useState(true);
  const [myScore, setMyScore] = useState(0);
  const [isCollected, setIsCollected] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [WR, setWR] = useState(0);
  const [v, setV] = useState(0);
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
      setV(sc.v);
      setDistribution(sc.distribution || {});
    } catch (err) {
      toastError('[Detail]', err);
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
      setV(sc.v);
      setDistribution(sc.distribution || {});
    } catch (err) {
      Taro.showToast({ title: '评分失败', icon: 'none' });
    }
  };

  const ensureLogin = () => {
    if (UserService.hasLogin) return true;
    Taro.showToast({ title: '请先登录', icon: 'none' });
    return false;
  };

  const toggleCollect = async () => {
    if (!ensureLogin()) return;
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
    if (!ensureLogin()) return;
    const next = !isWatched;
    setIsWatched(next);
    try {
      await CollectionService.toggle(id, 'watched', next);
    } catch (err) {
      setIsWatched(!next);
    }
  };

  // const onOpenBili = () => {
  //   if (!ensureLogin()) return;
  //   if (anim?.bvid) openBilibili(anim.bvid);
  // };

  const onCorrect = () => {
    if (!ensureLogin()) return;
    if (!id) return;
    Taro.navigateTo({
      url: `/pages/animation-form/index?mode=correction&correction_of=${id}`,
    });
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

  const tagList = (anim.tags && anim.tags.length > 0
    ? anim.tags
    : (anim.tag || '').split(',')
  )
    .map((item) => item.trim())
    .filter(Boolean);
  const displayDuration = formatDuration(
    anim.duration ?? anim.durationText ?? null,
  );

  return (
    <View className={styles.pageDetail}>
      <ScrollView scrollY className={styles.detailScroll}>
        <View className={styles.content}>
          {/* 头图概览 */}
          <View className={styles.heroSection}>
            <View className={styles.coverSection}>
              <Image className={styles.cover} src={anim.cover} mode="aspectFill" />
              <View className={styles.coverMask}>
                <Text className={styles.coverDuration}>{displayDuration}</Text>
              </View>
            </View>

            <View className={styles.summaryCard}>
              <Text className={styles.title} onClick={() => copyText(anim.title)}>{anim.title}</Text>
              {anim.original_title ? (
                <Text className={styles.subTitle} onClick={() => copyText(anim.original_title)}>
                  {anim.original_title}
                </Text>
              ) : null}
              <View className={styles.metaRow}>
                <Text className={styles.metaBadge} onClick={() => copyText(anim.up_name)}>{anim.up_name}</Text>
                <Text className={styles.metaBadge} onClick={() => copyText(anim.bvid, true)}>{anim.bvid}</Text>
              </View>
              <TagRow tags={tagList} />

              <View className={styles.statsGrid}>
                <View className={styles.statCard}>
                  <View className={styles.statIconWrap}>
                    <AppIcon name="movie" size="28rpx" className={styles.statIcon} />
                  </View>
                  <Text className={styles.statValue}>
                    {formatNumber(anim.play_count || 0)}
                  </Text>
                </View>
                <View className={styles.statCard}>
                  <View className={styles.statIconWrap}>
                    <AppIcon
                      name="collection"
                      size="26rpx"
                      className={styles.statIcon}
                    />
                  </View>
                  <Text className={styles.statValue}>
                    {formatNumber(anim.like_count || 0)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* 评分区 */}
          <View className={styles.scoreSection}>
            <View className={styles.sectionHeader}>
              <View className={styles.sectionHeaderMain}>
                <Text className={styles.sectionTitle}>综合评分</Text>
                <Text className={styles.sectionDesc}>
                  基于全部用户评分计算的 WR 综合分
                </Text>
              </View>
              <Text className={styles.sectionAside}>{v} 人参与</Text>
            </View>

            <View className={styles.scoreLayout}>
              {/* 左：WR 综合分 */}
              <View className={styles.scoreColLeft}>
                <View className={styles.scoreMain}>
                  <Text className={styles.scoreBig}>{WR.toFixed(1)}</Text>
                </View>
                <Text className={styles.scoreMeta}>综合评分</Text>
              </View>

              {/* 右：评分分布 */}
              <View className={styles.scoreColRight}>
                <ScoreChart distribution={distribution} compact />
              </View>
            </View>
          </View>

          {/* 我的评分 */}
          <View className={styles.myRatingSection}>
            <RatingRow value={myScore} onChange={onRate} size={40} />
            <Text className={styles.myRatingHint}>
              评分会实时参与综合分计算，你可以随时修改自己的星级
            </Text>
          </View>

          {/* 操作区 */}
          <View className={styles.actionSection}>
            <View className={styles.sectionHeader}>
              <View className={styles.sectionHeaderMain}>
                <Text className={styles.sectionTitle}>快捷操作</Text>
                <Text className={styles.sectionDesc}>
                  收藏、标记看过、复制 B 站链接或提交勘误
                </Text>
              </View>
            </View>
            <View className={styles.actionRow}>
              <View
                className={`${styles.actionBtn} ${isCollected ? styles.actionActive : ''}`}
                onClick={toggleCollect}
              >
                <AppIcon
                  name={isCollected ? 'collectionFilled' : 'collection'}
                  size="40rpx"
                  className={styles.actionIcon}
                />
                <Text className={styles.actionText}>
                  {isCollected ? '已收藏' : '收藏'}
                </Text>
              </View>

              <View
                className={`${styles.actionBtn} ${isWatched ? styles.actionActive : ''}`}
                onClick={toggleWatched}
              >
                <AppIcon
                  name={isWatched ? 'watchedFilled' : 'watched'}
                  size="40rpx"
                  className={styles.actionIcon}
                />
                <Text className={styles.actionText}>
                  {isWatched ? '已看过' : '已看过'}
                </Text>
              </View>

              {/* <View className={styles.actionBtn} onClick={onOpenBili}>
                <AppIcon name="link" size="40rpx" className={styles.actionIcon} />
                <Text className={styles.actionText}>复制链接</Text>
              </View> */}

              <View className={styles.actionBtn} onClick={onCorrect}>
                <AppIcon name="edit" size="40rpx" className={styles.actionIcon} />
                <Text className={styles.actionText}>勘误</Text>
              </View>
            </View>
            <Text className={styles.actionNote}>
              所有操作即时生效，勘误内容提交后进入审核流程
            </Text>
          </View>

          <View className={styles.bottomSafe} />
        </View>
      </ScrollView>
    </View>
  );
};

export default DetailPage;
