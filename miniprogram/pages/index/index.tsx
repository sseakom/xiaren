import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useReachBottom, usePullDownRefresh, useDidShow, useShareAppMessage } from '@tarojs/taro';
import { Animation } from '@/types';
import { AnimationService, ListSort } from '@/services/business';
import { formatNumber, formatDuration } from '@/utils/util';
import Skeleton from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import CustomTabbar from '@/components/CustomTabbar';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

/** 顶部排序 Tab 配置
 * 注意：duration_asc 和 duration_desc 共用同一个"时长" Tab，asc↔desc 状态由 sortBy 决定。
 */
const SORT_TABS: { key: ListSort; label: string }[] = [
  { key: 'publish_time', label: '最新' },
  { key: 'play_count', label: '播放量' },
  { key: 'duration_asc', label: '时长' },
];

const IndexPage: React.FC = () => {
  const [list, setList] = useState<Animation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<ListSort>('publish_time');

  // 分享给朋友
  useShareAppMessage(() => ({
    title: '虾仁宇宙 - 发现最沙雕的番剧',
    path: '/pages/index/index',
  }));

  const load = useCallback(
    async (p: number, isRefresh = false) => {
      try {
        const res = await AnimationService.list(p, PAGE_SIZE, sortBy);
        const data = (res.list || []) as Animation[];
        const total = res.total || 0;
        const enriched = data.map((a) => ({
          ...a,
          durationText: formatDuration(a.duration),
        }));
        setList((prev) => (p === 0 || isRefresh ? enriched : [...prev, ...enriched]));
        // 用 total 判定：已加载数 < total 说明还有更多
        setHasMore((p + 1) * PAGE_SIZE < total);
        setPage(p + 1);
      } catch (err) {
        console.error('[Index] 加载失败', err);
        Taro.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [sortBy],
  );

  useEffect(() => {
    load(0, true);
  }, [load]);

  useDidShow(() => {
    // 从其他页面返回时，如果排序未变则刷新一次
    if (list.length > 0 && !loading) {
      load(0, true);
    }
    // ⚠️ useDidShow 不重置排序，避免误触
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

  /** 切换排序（特殊处理"时长"：点同一按钮切换 asc/desc） */
  const onSwitchSort = (key: ListSort) => {
    if (key === 'duration_asc' || key === 'duration_desc') {
      const next = sortBy === 'duration_asc' ? 'duration_desc' : 'duration_asc';
      setSortBy(next);
    } else {
      setSortBy(key);
    }
  };

  const goSearch = () => Taro.navigateTo({ url: '/pages/search/index' });

  const goDetail = (id: string) =>
    Taro.navigateTo({ url: `/pages/detail/index?id=${id}` });

  // 时长 tab 是否激活（asc 或 desc 都算激活）
  const isDurationActive = sortBy === 'duration_asc' || sortBy === 'duration_desc';
  const durationArrow = sortBy === 'duration_asc' ? '↑' : sortBy === 'duration_desc' ? '↓' : '';

  return (
    <View className={styles.pageIndex}>
      {/* 搜索入口 */}
      <View className={styles.searchBar} onClick={goSearch}>
        <View className={styles.searchInput}>
          <Text className={styles.searchIcon}>🔍</Text>
          <Text className={styles.searchPlaceholder}>搜索动画片源...</Text>
        </View>
      </View>

      {/* 排序 Tab 栏 */}
      <View className={styles.sortBar}>
        {SORT_TABS.map((tab) => {
          const active = tab.key === 'publish_time'
            ? sortBy === 'publish_time'
            : tab.key === 'play_count'
              ? sortBy === 'play_count'
              : isDurationActive;
          const isDuration = tab.key === 'duration_asc' || tab.key === 'duration_desc';
          return (
            <View
              key={tab.key}
              className={`${styles.sortTab} ${active ? styles.sortTabActive : ''}`}
              onClick={() => onSwitchSort(tab.key as ListSort)}
            >
              <Text>{tab.label}</Text>
              {isDuration ? (
                <Text className={styles.sortArrow}>{active ? durationArrow : '↑'}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <Skeleton type="card" loading={loading}>
        {list.length > 0 ? (
          <View className={styles.animList}>
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
                  {item.tag ? (
                    <View className={styles.animtag}>
                      {item.tag.split(',').map((tag: string) => (
                        <Text key={tag} className={styles.animTag}>
                          {tag}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <View className={styles.animMeta}>
                    <Text className={styles.metaAuthor} numberOfLines={1}>
                      {item.up_name}
                    </Text>
                    <Text className={styles.metaDot}>·</Text>
                    <Text className={styles.metaPlay}>
                      {formatNumber(item.play_count || 0)} 播放
                    </Text>
                    {item.score != null && (
                      <>
                        <Text className={styles.metaDot}>·</Text>
                        <Text className={styles.metaScore}>
                          <Text className={styles.metaScoreIcon}>★</Text>
                          {item.score.toFixed(1)}
                        </Text>
                      </>
                    )}
                  </View>
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
          </View>
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
