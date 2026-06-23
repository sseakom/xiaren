import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro, { useShareAppMessage, useDidShow, useReachBottom } from '@tarojs/taro';
import { Animation } from '@/types';
import { AnimationService } from '@/services/business';
import { formatNumber } from '@/utils/util';
import { goDetail } from '@/utils/nav';
import Skeleton from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import CustomTabbar from '@/components/CustomTabbar';
import AnimCard from '@/components/AnimCard';
import StatItem from '@/components/StatItem';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import styles from './index.module.scss';

const PAGE_SIZE = 20;
const STORAGE_KEY = 'search_history';
const HOT_KEYWORDS = ['沙雕动画', '虾仁动画', '搞笑短剧', '沙雕修仙', '沙雕末日', '沙雕短剧'];

const SearchPage: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [results, setResults] = useState<Animation[]>([]);
  const [total, setTotal] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [autoFocus, setAutoFocus] = useState(true);
  const inputRef = useRef<any>(null);

  useShareAppMessage(() => ({
    title: '来虾仁宇宙搜点好玩的',
    path: '/pages/search/index',
  }));

  // 页面每次显示时（包括从其他页面返回）都重新聚焦
  // 单纯靠 focus 属性只在首次挂载生效，useDidShow 解决"返回搜索页不聚焦"
  useDidShow(() => {
    setAutoFocus(false);
    Taro.nextTick(() => {
      setAutoFocus(true);
      // 双保险：直接调原生 focus
      if (inputRef.current?.focus) inputRef.current.focus();
    });
  });

  useEffect(() => {
    const h = Taro.getStorageSync(STORAGE_KEY) || [];
    setHistory(h.slice(0, 10));
  }, []);

  const saveHistory = (kw: string) => {
    let h: string[] = Taro.getStorageSync(STORAGE_KEY) || [];
    h = h.filter((x) => x !== kw);
    h.unshift(kw);
    h = h.slice(0, 10);
    Taro.setStorageSync(STORAGE_KEY, h);
    setHistory(h);
  };

  const doSearch = useCallback(
    async (p: number, isNew = false, kw: string = keyword) => {
      const q = kw.trim();
      if (!q) return;
      try {
        if (p === 0) setLoading(true);
        setLoadingMore(p > 0);
        // 走 AnimationService.search（内部 callFunction 'search' + 超时/日志）
        const list = (await AnimationService.search(q, p, PAGE_SIZE)) as Animation[];
        setTotal(list.length);
        setResults((prev) => (p === 0 || isNew ? list : [...prev, ...list]));
        setHasMore(list.length >= PAGE_SIZE);
        setPage(p + 1);
      } catch (err) {
        console.error('[Search] 搜索失败', err);
        Taro.showToast({ title: '搜索失败', icon: 'none' });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [keyword],
  );

  const onSearch = () => {
    if (!keyword.trim()) {
      Taro.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }
    saveHistory(keyword.trim());
    setHasSearched(true);
    setPage(0);
    setResults([]);
    doSearch(0, true);
  };

  const onClear = () => {
    setKeyword('');
    setHasSearched(false);
    setResults([]);
  };

  useReachBottom(() => {
    if (loading || loadingMore || !hasMore || !hasSearched) return;
    doSearch(page);
  });

  /**
   * 点击历史/热门关键词：先回填输入框，再立即用最新值触发搜索
   * 直接传 kw 给 doSearch，避免 setTimeout/onChange 竞态
   */
  const onPickKeyword = (kw: string) => {
    const q = kw.trim();
    if (!q) return;
    setKeyword(q);
    saveHistory(q);
    setHasSearched(true);
    setPage(0);
    setResults([]);
    doSearch(0, true, q);
  };

  const clearHistory = () => {
    Taro.removeStorageSync(STORAGE_KEY);
    setHistory([]);
  };

  return (
    <View className={styles.pageSearch}>
      <View className={styles.searchHeader}>
        <View className={styles.searchInputWrap}>
          <Text className={styles.searchIcon}>🔍</Text>
          <Input
            ref={inputRef}
            className={styles.searchInput}
            placeholder="搜索动画名称、UP主..."
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            onConfirm={onSearch}
            focus={autoFocus}
            confirmType="search"
          />
          {keyword ? (
            <Text className={styles.searchClear} onClick={onClear}>
              ✕
            </Text>
          ) : null}
        </View>
        <Text className={styles.searchBtn} onClick={onSearch}>
          搜索
        </Text>
      </View>

      {!hasSearched ? (
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
                    key={item._id}
                    item={item}
                    onClick={goDetail}
                    footer={
                      <>
                        <Text className={styles.animCreator}>{item.up_name}</Text>
                        <View className={styles.animStats}>
                          <StatItem
                            value={formatNumber(item.play_count || 0)}
                            label="播放"
                          />
                          <StatItem
                            value={formatNumber(item.like_count || 0)}
                            label="点赞"
                          />
                        </View>
                      </>
                    }
                  />
                ))}

                <LoadMoreFooter hasMore={hasMore} loading={loadingMore} />
              </ScrollView>
            ) : (
              !loading && (
                <EmptyState
                  icon="🔍"
                  title="未找到相关动画"
                  description="换个关键词试试吧"
                />
              )
            )}
          </Skeleton>
        </View>
      )}
      <CustomTabbar currentPath="/pages/search/index" />
    </View>
  );
};

export default SearchPage;
