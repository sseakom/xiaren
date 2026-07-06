import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useShareAppMessage, useReachBottom } from '@tarojs/taro';
import { SearchBar } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/searchbar/style/style.css';
import { Animation } from '@/types';
import { AnimationService } from '@/services/business';
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

  // 用 ref 保存最新 keyword/category，避免 doSearch 把它们写进依赖导致频繁重建
  const keywordRef = useRef(keyword);
  const categoryRef = useRef(category);
  const pageRef = useRef(0);
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const hasSearchedRef = useRef(false);
  keywordRef.current = keyword;
  categoryRef.current = category;
  loadingRef.current = loading;
  loadingMoreRef.current = loadingMore;
  hasMoreRef.current = hasMore;
  hasSearchedRef.current = hasSearched;

  useShareAppMessage(() => ({
    title: '来虾仁宇宙搜点好玩的',
    path: '/pages/search/index',
  }));

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const doSearch = useCallback(async (p: number, opts: { kw?: string; cat?: string; reset?: boolean } = {}) => {
    const kw = (opts.kw ?? keywordRef.current).trim();
    const cat = opts.cat ?? categoryRef.current;
    if (!kw) return;
    try {
      if (p === 0) setLoading(true);
      else setLoadingMore(true);
      const { list, total } = await AnimationService.search(kw, p, PAGE_SIZE, cat);
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

  const triggerSearch = useCallback((kw: string, cat?: string) => {
    setHasSearched(true);
    setTotal(0);
    setResults([]);
    pageRef.current = 0;
    doSearch(0, { kw, cat, reset: true });
  }, [doSearch]);

  const onSearch = useCallback(() => {
    const q = keyword.trim();
    if (!q) {
      Taro.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }
    setHistory(writeHistory(q));
    triggerSearch(q);
  }, [keyword, triggerSearch]);

  const onClear = useCallback(() => {
    setKeyword('');
    setHasSearched(false);
    setTotal(0);
    setResults([]);
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
    triggerSearch(q, cat);
  }, [keyword, triggerSearch]);

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
