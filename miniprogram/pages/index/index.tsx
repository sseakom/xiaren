import React, { useState } from 'react';
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
import AnimCardFooter from '@/components/AnimCardFooter';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import CategoryFilter from '@/components/CategoryFilter';
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
    title: '虾仁宇宙',
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

  /** 切换排序（特殊处理"时长"：点同一按钮切换 asc/desc） */
  const onSwitchSort = (key: ListSort) => {
    if (key === 'duration_asc' || key === 'duration_desc') {
      setSortBy((prev) => (prev === 'duration_asc' ? 'duration_desc' : 'duration_asc'));
    } else {
      setSortBy(key);
    }
  };

  // 时长 tab 是否激活（asc 或 desc 都算激活）
  const isDurationActive = sortBy === 'duration_asc' || sortBy === 'duration_desc';
  const durationArrow = sortBy === 'duration_asc' ? '↑' : sortBy === 'duration_desc' ? '↓' : '';

  /** 切换分类筛选 */
  const onSwitchCategory = (cat: string) => {
    setCategory(cat);
  };

  return (
    <View className={styles.pageIndex}>

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
        <View className={styles.sortBarRight}>
          <CategoryFilter value={category} onChange={onSwitchCategory} />
        </View>
      </View>

      <Skeleton type="card" loading={loading}>
        {list.length > 0 ? (
          <View className={styles.animList}>
            {list.map((item, idx) => (
              <AnimCard
                key={item._id}
                item={item}
                onClick={goDetail}
                rank={idx}
                footer={<AnimCardFooter item={item} />}
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
              title="暂无动画片源"
              description="采集器正在努力收录中..."
            />
          )
        )}
      </Skeleton>
    </View>
  );
};

export default IndexPage;
