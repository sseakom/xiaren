import React, { useEffect, useState, useCallback } from 'react';
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { View, Text, Image as TaroImage } from '@tarojs/components';
import { SubmissionService } from '@/services/business';
import { Submission, SubmissionType } from '@/types';
import { formatDateTime, formatDuration } from '@/utils/util';
import styles from './index.module.scss';

const TYPE_LABEL: Record<SubmissionType, string> = {
  create: '录入',
  correction: '勘误',
  correction_delete: '申请删除',
};

const TYPE_COLOR: Record<SubmissionType, string> = {
  create: 'typeCreate',
  correction: 'typeCorrection',
  correction_delete: 'typeDelete',
};

const MySubmissionsPage: React.FC = () => {
  const [list, setList] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await SubmissionService.listMySubmissions();
      setList(data);
    } catch (err) {
      console.error('[my-submissions] 加载失败', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePullDownRefresh(() => {
    void load();
    setTimeout(() => Taro.stopPullDownRefresh(), 300);
  });

  return (
    <View className={styles.page}>
      <View className={styles.tip}>
        我的提交记录：审核中 / 已驳回。审核通过后会直接发布到首页。
      </View>
      {loading && list.length === 0 ? (
        <View className={styles.empty}>
          <Text>加载中…</Text>
        </View>
      ) : list.length === 0 ? (
        <View className={styles.empty}>
          <Text>暂无提交记录</Text>
        </View>
      ) : (
        <View className={styles.list}>
          {list.map((it) => {
            const isCreate = it.type === 'create';
            const showTitle = isCreate
              ? (it.payload as any)?.title || '未命名'
              : it.type === 'correction'
              ? (it.payload as any)?.title || it.target?.title || '勘误'
              : it.target?.title || '申请删除';
            const showCover = isCreate
              ? (it.payload as any)?.cover
              : it.target?.cover;
            const showUp = isCreate
              ? (it.payload as any)?.up_name
              : it.target?.up_name;
            const showDur = isCreate
              ? Number((it.payload as any)?.duration) || 0
              : Number(it.target?.duration) || 0;
            return (
              <View key={it._id} className={styles.item}>
                <View className={styles.coverWrap}>
                  {showCover ? (
                    <TaroImage
                      className={styles.cover}
                      src={showCover}
                      mode="aspectFill"
                    />
                  ) : (
                    <View className={styles.coverPlaceholder}>无封面</View>
                  )}
                </View>
                <View className={styles.info}>
                  <View className={styles.titleRow}>
                    <Text className={`${styles.typeTag} ${styles[TYPE_COLOR[it.type]] || ''}`}>
                      {TYPE_LABEL[it.type] || it.type}
                    </Text>
                    <Text className={styles.title} numberOfLines={1}>
                      {showTitle}
                    </Text>
                    <Text
                      className={`${styles.statusTag} ${
                        it.status === 2 ? styles.statusPending : styles.statusRejected
                      }`}
                    >
                      {it.status === 2 ? '审核中' : '已驳回'}
                    </Text>
                  </View>
                  <Text className={styles.meta}>
                    {showUp || '未知 UP'} · {formatDuration(showDur)}
                  </Text>
                  <Text className={styles.meta}>
                    提交时间：{formatDateTime(it.submitted_at)}
                  </Text>
                  {it.review_time && (
                    <Text className={styles.meta}>
                      审核时间：{formatDateTime(it.review_time)}
                    </Text>
                  )}
                  {it.review_comment && (
                    <View className={styles.reviewBox}>
                      <Text className={styles.reviewLabel}>
                        {it.status === 3 ? '驳回原因' : '审核备注'}：
                      </Text>
                      <Text className={styles.reviewText}>{it.review_comment}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

export default MySubmissionsPage;
