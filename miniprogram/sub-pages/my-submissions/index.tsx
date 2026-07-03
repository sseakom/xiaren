import React, { useEffect, useState, useCallback } from 'react';
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { View, Text, Image as TaroImage } from '@tarojs/components';
import { SubmissionService } from '@/services/business';
import { Submission } from '@/types';
import { formatDateTime, formatDuration } from '@/utils/util';
import { toastError, toastOpError } from '@/utils/error';
import {
  SUBMISSION_TYPE_LABEL,
  SUBMISSION_TYPE_COLOR,
  getSubmissionDisplay,
} from '@/utils/submission';
import styles from './index.module.scss';

const MySubmissionsPage: React.FC = () => {
  const [list, setList] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await SubmissionService.listMySubmissions();
      setList(data);
    } catch (err) {
      toastError('[my-submissions]', err);
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

  const onCancel = (it: Submission) => {
    if (it.status !== 2) return;
    Taro.showModal({
      title: '取消提交',
      content: `确认取消「${SUBMISSION_TYPE_LABEL[it.type] || it.type}」吗？取消后无法恢复。`,
      confirmText: '确认取消',
      cancelText: '不取消',
      confirmColor: '#d23a3a',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await SubmissionService.cancel(it._id);
          Taro.showToast({ title: '已取消', icon: 'success' });
          setList((prev) => prev.filter((x) => x._id !== it._id));
        } catch (err) {
          toastOpError('[my-submissions]', err, '取消失败');
        }
      },
    });
  };

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
            const disp = getSubmissionDisplay(it);
            return (
              <View key={it._id} className={styles.itemWrap}>
                <View className={styles.item}>
                  <View className={styles.coverWrap}>
                    {disp.cover ? (
                      <TaroImage
                        className={styles.cover}
                        src={disp.cover}
                        mode="aspectFill"
                      />
                    ) : (
                      <View className={styles.coverPlaceholder}>无封面</View>
                    )}
                  </View>
                  <View className={styles.info}>
                    <View className={styles.titleRow}>
                      <Text className={styles.title} numberOfLines={2}>
                        {disp.title}
                      </Text>
                    </View>
                    <Text className={styles.meta}>
                      {disp.upName || '未知 UP'} · {formatDuration(disp.duration || 0)}
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
                    {it.status === 2 && (
                      <View className={styles.actions}>
                        <View
                          className={styles.cancelBtn}
                          onClick={() => onCancel(it)}
                        >
                          <Text className={styles.cancelBtnText}>取消提交</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
                <View className={styles.tagRow}>
                  <Text className={`${styles.typeTag} ${styles[SUBMISSION_TYPE_COLOR[it.type]] || ''}`}>
                    {SUBMISSION_TYPE_LABEL[it.type] || it.type}
                  </Text>
                  <Text
                    className={`${styles.statusTag} ${
                      it.status === 2 ? styles.statusPending : styles.statusRejected
                    }`}
                  >
                    {it.status === 2 ? '审核中' : '已驳回'}
                  </Text>
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
