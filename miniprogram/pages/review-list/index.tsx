import React, { useEffect, useState, useCallback } from 'react';
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { View, Text, Image as TaroImage } from '@tarojs/components';
import { ReviewService } from '@/services/business';
import { UserService } from '@/services/user';
import { AnimationSubmission } from '@/types';
import { formatDateTime } from '@/utils/util';
import styles from './index.module.scss';

const ReviewListPage: React.FC = () => {
  const [list, setList] = useState<AnimationSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState<number[]>([2]);

  const load = useCallback(async () => {
    if (!UserService.isAdmin()) {
      setDenied(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await ReviewService.list(filter);
      setList(data);
    } catch (err) {
      console.error('[review-list] 加载失败', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  usePullDownRefresh(() => {
    void load();
    setTimeout(() => Taro.stopPullDownRefresh(), 300);
  });

  const onTap = (item: AnimationSubmission) => {
    Taro.navigateTo({ url: `/pages/review-detail/index?id=${item._id}` });
  };

  if (denied) {
    return (
      <View className={styles.empty}>
        <Text>仅管理员可访问该页面</Text>
      </View>
    );
  }

  return (
    <View className={styles.page}>
      <View className={styles.filterBar}>
        <View
          className={`${styles.chip} ${filter.length === 1 && filter[0] === 2 ? styles.chipActive : ''}`}
          onClick={() => setFilter([2])}
        >
          待审 ({list.filter((it) => it.status === 2).length})
        </View>
        <View
          className={`${styles.chip} ${filter.length === 1 && filter[0] === 3 ? styles.chipActive : ''}`}
          onClick={() => setFilter([3])}
        >
          驳回 ({list.filter((it) => it.status === 3).length})
        </View>
        <View
          className={`${styles.chip} ${filter.length === 2 ? styles.chipActive : ''}`}
          onClick={() => setFilter([2, 3])}
        >
          全部
        </View>
      </View>

      {loading && list.length === 0 ? (
        <View className={styles.empty}>
          <Text>加载中…</Text>
        </View>
      ) : list.length === 0 ? (
        <View className={styles.empty}>
          <Text>暂无{filter[0] === 3 ? '驳回' : '待审'}记录</Text>
        </View>
      ) : (
        <View className={styles.list}>
          {list.map((it) => (
            <View
              key={it._id}
              className={styles.item}
              onClick={() => onTap(it)}
            >
              <View className={styles.coverWrap}>
                {it.cover ? (
                  <TaroImage
                    className={styles.cover}
                    src={it.cover}
                    mode="aspectFill"
                  />
                ) : (
                  <View className={styles.coverPlaceholder}>无封面</View>
                )}
              </View>
              <View className={styles.info}>
                <View className={styles.titleRow}>
                  <Text className={styles.title} numberOfLines={1}>
                    {it.title}
                  </Text>
                  <Text
                    className={`${styles.statusTag} ${
                      it.status === 2 ? styles.statusPending : styles.statusRejected
                    }`}
                  >
                    {it.status === 2 ? '待审' : '驳回'}
                  </Text>
                </View>
                <Text className={styles.meta}>
                  {it.up_name} · {it.bvid}
                </Text>
                <Text className={styles.meta}>
                  提交人：{(it as any).submitter?.nickName || '匿名用户'}
                </Text>
                <Text className={styles.meta}>
                  {it.submitted_at ? formatDateTime(it.submitted_at) : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default ReviewListPage;
