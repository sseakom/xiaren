import React, { useEffect, useState, useCallback } from 'react';
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
import AnimCardFooter from '@/components/AnimCardFooter';
import LoadMoreFooter from '@/components/LoadMoreFooter';
import styles from './index.module.scss';

const PAGE_SIZE = 20;
const STORAGE_KEY = 'search_history';
const HOT_KEYWORDS = ['沙雕', '虾仁', '搞笑', '修仙', '末日'];

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
  const [category, setCategory] = useState('');

  useShareAppMessage(() => ({
    title: '来虾仁宇宙搜点好玩的',
    path: '/pages/search/index',
  }));


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
    async (p: number, isNew = false, kw: string = keyword, cat: string = category) => {
      const q = kw.trim();
      if (!q) return;
      try {
        if (p === 0) setLoading(true);
        setLoadingMore(p > 0);
        // 走 AnimationService.search（内部 callFunction 'search' + 超时/日志）
        const { list, total } = await AnimationService.search(q, p, PAGE_SIZE, cat);
        setTotal(total);
        setResults((prev) => (p === 0 || isNew ? list : [...prev, ...list]));
        setHasMore(list.length >= PAGE_SIZE);
        setPage(p + 1);
      } catch (err) {
        toastError('[Search]', err, '搜索失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [keyword, category],
  );

  const onSearch = () => {
    if (!keyword.trim()) {
      Taro.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }
    saveHistory(keyword.trim());
    setHasSearched(true);
    setTotal(0);
    setPage(0);
    setResults([]);
    doSearch(0, true);
  };

  const onClear = () => {
    setKeyword('');
    setHasSearched(false);
    setTotal(0);
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
    setTotal(0);
    setPage(0);
    setResults([]);
    doSearch(0, true, q);
  };

  const clearHistory = () => {
    Taro.removeStorageSync(STORAGE_KEY);
    setHistory([]);
  };

  /** 切换分类筛选：用当前关键词重新搜索 */
  const onSwitchCategory = (cat: string) => {
    setCategory(cat);
    const q = keyword.trim();
    if (!q) {
      Taro.showToast({ title: '请先输入搜索关键词', icon: 'none' });
      return;
    }
    setHasSearched(true);
    setTotal(0);
    setPage(0);
    setResults([]);
    doSearch(0, true, q, cat);
  };

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
                    footer={<AnimCardFooter item={item} />}
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
