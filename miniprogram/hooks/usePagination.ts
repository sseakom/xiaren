import React, { useEffect, useState, useCallback, useRef } from 'react';
import Taro, { useReachBottom, usePullDownRefresh } from '@tarojs/taro';
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
 *  - useReachBottom + usePullDownRefresh 注册
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

  // 用 ref 持有最新的 fetcher / onError，避免它们变化导致 load 反复重建
  const fetcherRef = useRef(fetcher);
  const onErrorRef = useRef(onError);
  fetcherRef.current = fetcher;
  onErrorRef.current = onError;

  const load = useCallback(async (p: number, isRefresh = false) => {
    // 与原各页面一致：第 0 页/刷新时 loading，加载更多时 loadingMore
    if (p === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await fetcherRef.current(p);
      // 在 setList 回调里同步计算累积长度，据此判断 hasMore
      let nextHasMore = false;
      setList((prev) => {
        const next = p === 0 || isRefresh ? res.list : [...prev, ...res.list];
        if (res.hasMore !== undefined) {
          nextHasMore = res.hasMore;
        } else if (res.total !== undefined) {
          nextHasMore = next.length < res.total;
        } else {
          nextHasMore = res.list.length > 0;
        }
        return next;
      });
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

  // deps 变化时重新加载第一页
  useEffect(() => {
    load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

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

  const refresh = useCallback(() => load(0, true), [load]);

  return { list, setList, loading, loadingMore, hasMore, page, load, refresh };
}
