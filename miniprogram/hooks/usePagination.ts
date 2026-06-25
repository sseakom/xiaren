import React, { useEffect, useState, useCallback, useRef } from 'react';
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { toastError } from '@/utils/error';

/** fetcher 返回值：list 必填；hasMore / total 二选一用于判断是否还有更多 */
export interface FetchResult<T> {
  list: T[];
  /** 显式指定是否还有更多（优先级最高） */
  hasMore?: boolean;
  /** 返回总数时由 hook 用「累积长度 < total」计算 hasMore */
  total?: number;
}

/**
 * 通用分页 hook
 *
 * 消除 index / search / my-ratings / my-collections 四个页面中重复的：
 *  - list / loading / loadingMore / hasMore / page 状态声明
 *  - load(p, refresh) + try/catch/finally 模板
 *  - 下拉刷新注册
 *
 * 上拉加载更多由页面层自行接入：
 *  - 页面滚动：useReachBottom(handleLoadMore)
 *  - ScrollView：onScrollToLower={handleLoadMore}
 *
 * @param fetcher  取数函数：传入页码，返回当前页列表 + hasMore/total
 * @param deps     依赖项；变化时自动回到第 0 页重新加载
 * @param onError  错误回调（缺省时走 toastError 通用处理）
 */
export interface PaginationResult<T> {
  list: T[];
  setList: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  page: number;
  /** 加载指定页（p=0 或 isRefresh=true 时清空重载） */
  load: (p: number, isRefresh?: boolean) => Promise<void>;
  /** 回到第 0 页重新加载 */
  refresh: () => Promise<void>;
  /** InfiniteLoading onLoadMore 回调 */
  handleLoadMore: () => Promise<void>;
}

export function usePagination<T>(
  fetcher: (page: number) => Promise<FetchResult<T>>,
  deps: React.DependencyList = [],
  onError?: (err: unknown) => void,
): PaginationResult<T> {
  const [list, setList] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetcherRef = useRef(fetcher);
  const onErrorRef = useRef(onError);
  const listRef = useRef(list);
  const pageRef = useRef(page);
  const loadingRef = useRef(loading);
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  fetcherRef.current = fetcher;
  onErrorRef.current = onError;
  listRef.current = list;
  pageRef.current = page;
  loadingRef.current = loading;
  loadingMoreRef.current = loadingMore;
  hasMoreRef.current = hasMore;

  const load = useCallback(async (p: number, isRefresh = false) => {
    if (p === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await fetcherRef.current(p);
      const prevList = p === 0 || isRefresh ? [] : listRef.current;
      const nextList = [...prevList, ...res.list];
      const nextHasMore = res.hasMore !== undefined
        ? res.hasMore
        : res.total !== undefined
          ? nextList.length < res.total
          : res.list.length > 0;

      setList(nextList);
      setHasMore(nextHasMore);
      setPage(p + 1);
    } catch (err) {
      if (onErrorRef.current) {
        onErrorRef.current(err);
      } else {
        toastError('[Pagination]', err);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current) return;
    await load(pageRef.current);
  }, [load]);

  useEffect(() => {
    load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  usePullDownRefresh(async () => {
    setLoading(true);
    await load(0, true);
    Taro.stopPullDownRefresh();
  });

  const refresh = useCallback(() => load(0, true), [load]);

  return { list, setList, loading, loadingMore, hasMore, page, load, refresh, handleLoadMore };
}
