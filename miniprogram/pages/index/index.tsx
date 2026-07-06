import React, { useState, useCallback, useMemo } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useShareAppMessage, useDidShow, useReachBottom } from '@tarojs/taro';
import '@nutui/nutui-react-taro/dist/es/packages/searchbar/style/style.css';
import { Animation } from '@/types';
import { AnimationService, ListSort } from '@/services/business';
import { goDetail } from '@/utils/nav';
import { usePagination } from '@/hooks/usePagination';
import { toastError } from '@/utils/error';
import AppIcon from '@/components/AppIcon';
import Skeleton from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import AnimCard from '@/components/AnimCard';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import CategoryFilter from '@/components/CategoryFilter';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

/** 顶部排序 Tab 配置
 * 播放量 / 弹幕 / 时长 共用同一种切换逻辑：点同一按钮在 asc↔desc 间切换。
 */
const SORT_TABS: { key: ListSort; label: string }[] = [
  { key: 'publish_time', label: '最新' },
  { key: 'play_count_desc', label: '播放量' },
  { key: 'danmaku_count_desc', label: '弹幕' },
  { key: 'duration_desc', label: '时长' },
];

/** 播放量/弹幕/时长 三组 asc/desc 前缀，点击同一按钮时互相切换 */
const TOGGLE_PAIRS: Record<string, [ListSort, ListSort]> = {
  play_count: ['play_count_desc', 'play_count_asc'],
  danmaku_count: ['danmaku_count_desc', 'danmaku_count_asc'],
  duration: ['duration_desc', 'duration_asc'],
};

/** 取 sortBy 的分组前缀（去掉 _asc/_desc） */
function sortGroup(key: ListSort): string | null {
  if (key === 'play_count_asc' || key === 'play_count_desc') return 'play_count';
  if (key === 'danmaku_count_asc' || key === 'danmaku_count_desc') return 'danmaku_count';
  if (key === 'duration_asc' || key === 'duration_desc') return 'duration';
  return null;
}

const IndexPage: React.FC = () => {
  const [sortBy, setSortBy] = useState<ListSort>('publish_time');
  const [category, setCategory] = useState('');

  const { list, loading, loadingMore, hasMore, load, handleLoadMore } = usePagination<Animation>(
    async (p) => {
      const res = await AnimationService.list(p, PAGE_SIZE, sortBy, category);
      const enriched = (res.list || []);
      return { list: enriched, total: res.total };
    },
    [sortBy, category],
    (err) => toastError('[Index]', err),
  );

  useReachBottom(() => {
    void handleLoadMore();
  });

  // 分享给朋友
  useShareAppMessage(() => ({
    title: '虾仁世界',
    path: '/pages/index/index',
  }));

  useDidShow(() => {
    // 只在从详情/搜索/收藏等非 tabbar 页面返回时刷新一次，
    // 避免 tabbar 互切（首页 ↔ 我的）触发重复请求
    const pages = Taro.getCurrentPages();
    const prev = pages[pages.length - 2] as any;
    const fromTabbar =
      !prev ||
      prev.route === '/pages/index/index' ||
      prev.route === '/pages/search/index' ||
      prev.route === '/pages/user/index';
    if (fromTabbar) return;
    if (list.length > 0 && !loading) {
      load(0, true);
    }
  });

  /** 切换排序：播放量/弹幕/时长的按钮点同一下在 asc↔desc 间切换 */
  const onSwitchSort = useCallback((key: ListSort) => {
    setSortBy((prev) => {
      const group = sortGroup(key);
      if (group && TOGGLE_PAIRS[group]) {
        const [desc, asc] = TOGGLE_PAIRS[group];
        // 当前在该组内 → 切到另一个方向
        if (sortGroup(prev) === group) return prev === desc ? asc : desc;
        // 从其他组切过来 → 默认用该组第一项（desc）
        return desc;
      }
      return key;
    });
  }, []);

  /** 切换分类筛选 */
  const onSwitchCategory = useCallback((cat: string) => {
    setCategory(cat);
  }, []);

  // 各组是否激活 + 箭头方向
  const currentGroup = sortGroup(sortBy);

  // 排序 Tab 栏渲染（sortBy/category 变化时重建，与列表渲染分离）
  const sortBar = useMemo(() => (
    <View className={styles.sortBar}>
      {SORT_TABS.map((tab) => {
        const g = sortGroup(tab.key);
        const active = g ? g === currentGroup : sortBy === tab.key;
        const arrow = g ? (sortBy === (TOGGLE_PAIRS[g]?.[1]) ? '↑' : '↓') : null;
        return (
          <View
            key={tab.key}
            className={`${styles.sortTab} ${active ? styles.sortTabActive : ''}`}
            onClick={() => onSwitchSort(tab.key)}
          >
            <Text>{tab.label}</Text>
            {g ? <Text className={styles.sortArrow}>{arrow}</Text> : null}
          </View>
        );
      })}
      <View className={styles.sortBarRight}>
        <CategoryFilter value={category} onChange={onSwitchCategory} />
      </View>
    </View>
  ), [sortBy, category, currentGroup, onSwitchSort, onSwitchCategory]);

  return (
    <View className={styles.pageIndex}>
      {sortBar}

      <Skeleton type="card" loading={loading}>
        {list.length > 0 ? (
          <View className={styles.animList}>
            {list.map((item, idx) => (
              <AnimCard
                key={item.bvid}
                item={item}
                onClick={goDetail}
                rank={idx}
              />
            ))}

            <LoadMoreFooter
              hasMore={hasMore}
              loading={loadingMore}
            />
          </View>
        ) : (
          !loading && (
            <EmptyState
              icon={<AppIcon name="movie" size="100rpx" />}
              title="暂无片源"
              description="正在努力收录中..."
            />
          )
        )}
      </Skeleton>
    </View>
  );
};

export default IndexPage;
