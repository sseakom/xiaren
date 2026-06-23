import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useReachBottom, usePullDownRefresh, useDidShow, useShareAppMessage } from '@tarojs/taro';
import { Animation } from '@/types';
import { AnimationService } from '@/services/business';
import { formatNumber, formatDuration } from '@/utils/util';
import Skeleton from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import CustomTabbar from '@/components/CustomTabbar';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

const IndexPage: React.FC = () => {
  const [list, setList] = useState<Animation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // 分享给朋友
  useShareAppMessage(() => ({
    title: '虾仁宇宙 - 发现最沙雕的番剧',
    path: '/pages/index/index',
  }));

  const load = useCallback(async (p: number, isRefresh = false) => {
    try {
      const data = (await AnimationService.list(p, PAGE_SIZE)) as Animation[];
      const enriched = data.map((a) => ({
        ...a,
        durationText: formatDuration(a.duration),
      }));
      setList((prev) => (p === 0 || isRefresh ? enriched : [...prev, ...enriched]));
      setHasMore(data.length >= PAGE_SIZE);
      setPage(p + 1);
    } catch (err) {
      console.error('[Index] 加载失败', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  useDidShow(() => {
    // 从其他页面返回时刷新一次
    if (list.length > 0 && !loading) {
      load(0, true);
    }
  });

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

  const goSearch = () => Taro.navigateTo({ url: '/pages/search/index' });

  const goDetail = (id: string) =>
    Taro.navigateTo({ url: `/pages/detail/index?id=${id}` });

  return (
    <View className={styles.pageIndex}>
      {/* 搜索入口 */}
      <View className={styles.searchBar} onClick={goSearch}>
        <View className={styles.searchInput}>
          <Text className={styles.searchIcon}>🔍</Text>
          <Text className={styles.searchPlaceholder}>搜索动画片源...</Text>
        </View>
      </View>

      <Skeleton type="card" loading={loading}>
        {list.length > 0 ? (
          <ScrollView scrollY className={styles.animList}>
            {list.map((item, idx) => (
              <View
                key={item._id}
                className={styles.animCard}
                onClick={() => goDetail(item._id)}
              >
                <View className={styles.animCoverWrap}>
                  <Image
                    className={styles.animCover}
                    src={item.cover}
                    mode="aspectFill"
                    lazyLoad
                  />
                  {item.duration ? (
                    <View className={styles.animDuration}>
                      {item.durationText}
                    </View>
                  ) : null}
                  <View className={styles.animRank}>
                    <Text
                      className={idx < 3 ? styles.rankTop : styles.rankNormal}
                    >
                      {idx + 1}
                    </Text>
                  </View>
                </View>
                <View className={styles.animInfo}>
                  <Text className={styles.animTitle}>{item.title}</Text>
                  <View className={styles.animMeta}>
                    <Text className={styles.animCreator}>{item.up_name}</Text>
                  </View>
                  <View className={styles.animStats}>
                    <View className={styles.statItem}>
                      <Text className={styles.statValue}>
                        {formatNumber(item.play_count || 0)}
                      </Text>
                      <Text className={styles.statLabel}>播放</Text>
                    </View>
                    <View className={styles.statItem}>
                      <Text className={styles.statValue}>
                        {formatNumber(item.like_count || 0)}
                      </Text>
                      <Text className={styles.statLabel}>点赞</Text>
                    </View>
                    <View className={styles.statItem}>
                      <Text className={styles.statValue}>
                        {formatNumber(item.danmaku_count || 0)}
                      </Text>
                      <Text className={styles.statLabel}>弹幕</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}

            {hasMore ? (
              <View className={styles.loadMore}>
                <Text>{loadingMore ? '加载中...' : '点击加载更多'}</Text>
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
                icon="🎬"
                title="暂无动画片源"
                description="采集器正在努力收录中..."
              />
            )
          )}
        </Skeleton>
        <CustomTabbar currentPath="/pages/index/index" />
      </View>
    );
  };

  export default IndexPage;
