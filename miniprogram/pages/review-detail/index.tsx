import React, { useEffect, useState, useCallback } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { View, Text, Image as TaroImage, Button, Textarea } from '@tarojs/components';
import { ReviewService } from '@/services/business';
import { AnimationSubmission } from '@/types';
import { formatDateTime, formatDuration } from '@/utils/util';
import styles from './index.module.scss';

const ReviewDetailPage: React.FC = () => {
  const router = useRouter();
  const id = (router.params && router.params.id) || '';

  const [item, setItem] = useState<AnimationSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await ReviewService.get(id);
      setItem(data);
    } catch (err) {
      console.error('[review-detail] 加载失败', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onApprove = async () => {
    if (!item) return;
    Taro.showModal({
      title: '确认通过',
      content: `通过后该动画将出现在首页/搜索列表。`,
      confirmText: '通过',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        setBusy(true);
        try {
          await ReviewService.approve(item._id, comment);
          Taro.showToast({ title: '已通过', icon: 'success' });
          setTimeout(() => Taro.navigateBack(), 1000);
        } catch (err: any) {
          Taro.showToast({ title: err?.message || '操作失败', icon: 'none' });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const onReject = async () => {
    if (!item) return;
    if (!comment.trim()) {
      Taro.showToast({ title: '请填写驳回原因', icon: 'none' });
      return;
    }
    Taro.showModal({
      title: '确认驳回',
      content: `驳回后提交人可在《我的提交》中看到原因。`,
      confirmText: '驳回',
      confirmColor: '#d23a3a',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        setBusy(true);
        try {
          await ReviewService.reject(item._id, comment);
          Taro.showToast({ title: '已驳回', icon: 'success' });
          setTimeout(() => Taro.navigateBack(), 1000);
        } catch (err: any) {
          Taro.showToast({ title: err?.message || '操作失败', icon: 'none' });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  if (loading) {
    return (
      <View className={styles.page}>
        <Text>加载中…</Text>
      </View>
    );
  }
  if (!item) {
    return (
      <View className={styles.page}>
        <Text>记录不存在或已删除</Text>
      </View>
    );
  }

  return (
    <View className={styles.page}>
      <View className={styles.card}>
        <View className={styles.coverWrap}>
          {item.cover ? (
            <TaroImage className={styles.cover} src={item.cover} mode="aspectFill" />
          ) : (
            <View className={styles.coverPlaceholder}>无封面</View>
          )}
        </View>
        <View className={styles.body}>
          <Text className={styles.title}>{item.title}</Text>
          <Text className={styles.meta}>{item.up_name} · {item.bvid}</Text>
          <Text className={styles.meta}>
            时长 {formatDuration(item.duration)} · 播放 {item.play_count || 0} · 赞 {item.like_count || 0}
          </Text>
          {item.tag && <Text className={styles.tags}>标签：{item.tag}</Text>}
          {item.url && (
            <Text className={styles.link} onClick={() => Taro.setClipboardData({ data: item.url })}>
              {item.url}
            </Text>
          )}
          <Text className={styles.meta}>发布时间：{formatDateTime(item.publish_time)}</Text>
        </View>
      </View>

      <View className={styles.card}>
        <Text className={styles.sectionTitle}>提交信息</Text>
        <Text className={styles.meta}>提交人：{(item as any).submitter?.nickName || '匿名用户'}</Text>
        <Text className={styles.meta}>提交时间：{formatDateTime(item.submitted_at)}</Text>
        {item.correction_of && (
          <Text className={styles.meta}>勘误来源：{item.correction_of}</Text>
        )}
        <Text
          className={`${styles.statusTag} ${
            item.status === 2
              ? styles.statusPending
              : item.status === 3
              ? styles.statusRejected
              : styles.statusApproved
          }`}
        >
          状态：{item.status === 2 ? '待审' : item.status === 3 ? '已驳回' : '已发布'}
        </Text>
        {item.review_comment && (
          <Text className={styles.reviewComment}>
            {item.status === 3 ? '驳回原因' : '审核备注'}：{item.review_comment}
          </Text>
        )}
        {item.review_time && (
          <Text className={styles.meta}>审核时间：{formatDateTime(item.review_time)}</Text>
        )}
      </View>

      {item.status === 2 && (
        <View className={styles.card}>
          <Text className={styles.sectionTitle}>审核操作</Text>
          <Text className={styles.label}>备注（驳回必填，通过选填）</Text>
          <Textarea
            className={styles.textarea}
            placeholder="如：标题/封面/标签不规范…"
            value={comment}
            maxlength={300}
            onInput={(e) => setComment(e.detail.value)}
          />
          <View className={styles.actionRow}>
            <Button
              className={`${styles.btn} ${styles.btnApprove}`}
              loading={busy}
              disabled={busy}
              onClick={onApprove}
            >
              通过
            </Button>
            <Button
              className={`${styles.btn} ${styles.btnReject}`}
              loading={busy}
              disabled={busy}
              onClick={onReject}
            >
              驳回
            </Button>
          </View>
        </View>
      )}
    </View>
  );
};

export default ReviewDetailPage;
