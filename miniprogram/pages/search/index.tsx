import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useShareAppMessage, useReachBottom } from '@tarojs/taro';
import { SearchBar } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/searchbar/style/style.css';
import { Animation } from '@/types';
import { AnimationService, ListSort } from '@/services/business';
import { goDetail } from '@/utils/nav';
import { toastError } from '@/utils/error';
import AppIcon from '@/components/AppIcon';
import Skeleton from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import CategoryFilter from '@/components/CategoryFilter';
import AnimCard from '@/components/AnimCard';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import styles from './index.module.scss';

const PAGE_SIZE = 20;
const STORAGE_KEY = 'search_history';
const HOT_KEYWORDS = ['沙雕', '虾仁', '搞笑', '修仙', '末日'];

/** 搜索排序 Tab：首项为相关度（默认），其余与首页一致 */
const SEARCH_SORT_TABS: { key: ListSort | 'relevance'; label: string }[] = [
  { key: 'relevance', label: '相关度' },
  { key: 'publish_time', label: '最新' },
  { key: 'play_count_desc', label: '播放量' },
  { key: 'danmaku_count_desc', label: '弹幕' },
  { key: 'duration_desc', label: '时长' },
  { key: 'score_desc', label: '评分' },
];

/** asc/desc 切换对（相关度除外） */
const TOGGLE_PAIRS: Record<string, [ListSort, ListSort]> = {
  play_count: ['play_count_desc', 'play_count_asc'],
  danmaku_count: ['danmaku_count_desc', 'danmaku_count_asc'],
  duration: ['duration_desc', 'duration_asc'],
  score: ['score_desc', 'score_asc'],
};

/** 取 sortBy 的分组前缀（去掉 _asc/_desc），publish_time 与 relevance 不参与 toggle */
function sortGroup(key: ListSort): string | null {
  if (key === 'play_count_asc' || key === 'play_count_desc') return 'play_count';
  if (key === 'danmaku_count_asc' || key === 'danmaku_count_desc') return 'danmaku_count';
  if (key === 'duration_asc' || key === 'duration_desc') return 'duration';
  if (key === 'score_asc' || key === 'score_desc') return 'score';
  return null;
}

function readHistory(): string[] {
  try {
    const raw = Taro.getStorageSync(STORAGE_KEY);
    if (Array.isArray(raw)) {
      return raw.filter((x): x is string => typeof x === 'string').slice(0, 10);
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeHistory(kw: string): string[] {
  const h = readHistory().filter((x) => x !== kw);
  h.unshift(kw);
  const next = h.slice(0, 10);
  Taro.setStorageSync(STORAGE_KEY, next);
  return next;
}

const SearchPage: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [results, setResults] = useState<Animation[]>([]);
  const [total, setTotal] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<ListSort | undefined>(undefined);

  // 用 ref 保存最新 keyword/category/sortBy，避免 doSearch 把它们写进依赖导致频繁重建
  const keywordRef = useRef(keyword);
  const categoryRef = useRef(category);
  const sortByRef = useRef<ListSort | undefined>(undefined);
  const pageRef = useRef(0);
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const hasSearchedRef = useRef(false);
  keywordRef.current = keyword;
  categoryRef.current = category;
  sortByRef.current = sortBy;
  loadingRef.current = loading;
  loadingMoreRef.current = loadingMore;
  hasMoreRef.current = hasMore;
  hasSearchedRef.current = hasSearched;

  useShareAppMessage(() => ({
    title: '来虾仁世界搜点好玩的',
    path: '/pages/search/index',
  }));

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const doSearch = useCallback(async (p: number, opts: { kw?: string; cat?: string; sortBy?: ListSort; reset?: boolean } = {}) => {
    const kw = (opts.kw ?? keywordRef.current).trim();
    const cat = opts.cat ?? categoryRef.current;
    const sb = opts.sortBy ?? sortByRef.current;
    if (!kw) return;
    try {
      if (p === 0) setLoading(true);
      else setLoadingMore(true);
      const { list, total } = await AnimationService.search(kw, p, PAGE_SIZE, cat, sb);
      const safeList = Array.isArray(list) ? list : [];
      setTotal(total || 0);
      setResults((prev) => (p === 0 || opts.reset ? safeList : [...prev, ...safeList]));
      // 用 total 精确判断是否到底，避免结果数恰好是 PAGE_SIZE 整数倍时多一次空加载
      const accumulated = (p === 0 || opts.reset ? 0 : p * PAGE_SIZE) + safeList.length;
      setHasMore(accumulated < (total || 0));
      pageRef.current = p + 1;
    } catch (err) {
      toastError('[Search]', err, '搜索失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const triggerSearch = useCallback((kw: string, cat?: string, nextSortBy?: ListSort) => {
    setHasSearched(true);
    setTotal(0);
    setResults([]);
    pageRef.current = 0;
    doSearch(0, { kw, cat, sortBy: nextSortBy, reset: true });
  }, [doSearch]);

  const onSearch = useCallback(() => {
    const q = keyword.trim();
    if (!q) {
      Taro.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }
    setHistory(writeHistory(q));
    // 新关键词搜索重置为相关度排序
    setSortBy(undefined);
    sortByRef.current = undefined;
    triggerSearch(q);
  }, [keyword, triggerSearch]);

  const onClear = useCallback(() => {
    setKeyword('');
    setHasSearched(false);
    setTotal(0);
    setResults([]);
    setSortBy(undefined);
    sortByRef.current = undefined;
  }, []);

  useReachBottom(() => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current || !hasSearchedRef.current) return;
    doSearch(pageRef.current);
  });

  const onPickKeyword = useCallback((kw: string) => {
    const q = kw.trim();
    if (!q) return;
    setKeyword(q);
    setHistory(writeHistory(q));
    // 新关键词搜索重置为相关度排序
    setSortBy(undefined);
    sortByRef.current = undefined;
    triggerSearch(q);
  }, [triggerSearch]);

  const clearHistory = useCallback(() => {
    Taro.removeStorageSync(STORAGE_KEY);
    setHistory([]);
  }, []);

  const onSwitchCategory = useCallback((cat: string) => {
    setCategory(cat);
    const q = keyword.trim();
    if (!q) {
      Taro.showToast({ title: '请先输入搜索关键词', icon: 'none' });
      return;
    }
    // 切换分类保留当前排序
    triggerSearch(q, cat, sortByRef.current);
  }, [keyword, triggerSearch]);

  /** 切换排序：相关度清空 sortBy；其余在 asc↔desc 间切换 */
  const onSwitchSort = useCallback((key: ListSort | 'relevance') => {
    let nextSortBy: ListSort | undefined;
    if (key === 'relevance') {
      nextSortBy = undefined;
    } else {
      const group = sortGroup(key);
      if (group && TOGGLE_PAIRS[group]) {
        const [desc, asc] = TOGGLE_PAIRS[group];
        const prev = sortByRef.current;
        const prevGroup = prev ? sortGroup(prev) : null;
        nextSortBy = prevGroup === group ? (prev === desc ? asc : desc) : desc;
      } else {
        // publish_time 等无 toggle 的
        nextSortBy = key;
      }
    }
    setSortBy(nextSortBy);
    sortByRef.current = nextSortBy;
    const q = keyword.trim();
    if (!q) return;
    triggerSearch(q, category, nextSortBy);
  }, [keyword, category, triggerSearch]);

  // 搜索前区域（搜索历史 + 热门）：hasSearched/history 不变时不重建
  const preSearchSection = useMemo(() => (
    <>
      {history.length > 0 ? (
        <View className={styles.searchHistory}>
          <View className={styles.historyHeader}>
            <Text className={styles.historyTitle}>搜索历史</Text>
            <Text className={styles.historyClear} onClick={clearHistory}>
              清除
            </Text>
          </View>
          <View className={styles.historytag}>
            {history.map((h) => (
              <Text
                key={h}
                className={styles.historyTag}
                onClick={() => onPickKeyword(h)}
              >
                {h}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <View className={styles.searchHot}>
        <Text className={styles.hotTitle}>🔥 热门搜索</Text>
        <View className={styles.hottag}>
          {HOT_KEYWORDS.map((kw) => (
            <Text
              key={kw}
              className={styles.hotTag}
              onClick={() => onPickKeyword(kw)}
            >
              {kw}
            </Text>
          ))}
        </View>
      </View>
    </>
  ), [history, onPickKeyword, clearHistory]);

  return (
    <View className={styles.pageSearch}>
      <View className={styles.stickyBar}>
        <View className={styles.searchHeader}>
          <SearchBar
            className={styles.searchBar}
            shape="round"
            value={keyword}
            placeholder="搜索动画名称、UP主..."
            clearable
            right={<Text className={styles.searchBtn} onClick={onSearch}>搜索</Text>}
            inputProps={{
              confirmType: 'search',
            }}
            onChange={(value) => setKeyword(value)}
            onClear={onClear}
            onSearch={onSearch}
          />
        </View>

        <View className={styles.filterBar}>
          <CategoryFilter value={category} onChange={onSwitchCategory} />
        </View>

        {hasSearched ? (
          <View className={styles.sortBar}>
            {SEARCH_SORT_TABS.map((tab) => {
              const isRelevance = tab.key === 'relevance';
              const g = isRelevance ? null : sortGroup(tab.key as ListSort);
              const active = isRelevance
                ? !sortBy
                : g
                  ? g === (sortBy ? sortGroup(sortBy) : null)
                  : sortBy === tab.key;
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
          </View>
        ) : null}
      </View>

      {!hasSearched ? (
        preSearchSection
      ) : (
        <View className={styles.searchResults}>
          <Skeleton type="card" loading={loading}>
            {results.length > 0 ? (
              <ScrollView scrollY className={styles.resultList}>
                <View className={styles.resultHeader}>
                  <Text>找到 {total} 个结果</Text>
                </View>
                {results.map((item) => (
                  <AnimCard
                    key={item.bvid}
                    item={item}
                    onClick={goDetail}
                  />
                ))}

                <LoadMoreFooter hasMore={hasMore} loading={loadingMore} />
              </ScrollView>
            ) : (
              !loading && (
                <EmptyState
                  icon={<AppIcon name="search" size="100rpx" />}
                  title="未找到相关动画"
                  description="换个关键词试试吧"
                />
              )
            )}
          </Skeleton>
        </View>
      )}
    </View>
  );
};

export default SearchPage;
