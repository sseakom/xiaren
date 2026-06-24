import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { View, Text, Image as TaroImage, Button, Textarea } from '@tarojs/components';
import { ReviewService } from '@/services/business';
import { Submission, SubmissionType } from '@/types';
import { formatDateTime, formatDuration } from '@/utils/util';
import styles from './index.module.scss';

const TYPE_LABEL: Record<SubmissionType, string> = {
  create: '录入动画',
  correction: '勘误',
  correction_delete: '申请删除',
};

const ReviewDetailPage: React.FC = () => {
  const router = useRouter();
  const id = (router.params && router.params.id) || '';

  const [item, setItem] = useState<Submission | null>(null);
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

  // 标题文案按 type 分发
  const approveCopy = useMemo(() => {
    if (!item) return '通过';
    if (item.type === 'create') return '通过';
    if (item.type === 'correction') return '通过';
    return '通过（删除原动画）';
  }, [item]);

  const approveConfirm = useMemo(() => {
    if (!item) return '通过后该动画将出现在首页/搜索列表。';
    if (item.type === 'create') return '通过后该动画将出现在首页/搜索列表。';
    if (item.type === 'correction') return '通过后将把新标题和标签合并到原动画。';
    return '通过后该动画将被永久删除。';
  }, [item]);

  const onApprove = async () => {
    if (!item) return;
    Taro.showModal({
      title: '确认通过',
      content: approveConfirm,
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

  const isCreate = item.type === 'create';
  const payload: any = item.payload || {};

  // 展示用字段
  const showTitle = isCreate
    ? payload.title
    : item.type === 'correction'
    ? payload.title || item.target?.title
    : item.target?.title || '（原动画）';
  const showCover = isCreate ? payload.cover : item.target?.cover;
  const showUp = isCreate ? payload.up_name : item.target?.up_name;
  const showBvid = isCreate ? payload.bvid : item.target?.bvid;
  const showDuration = isCreate ? payload.duration : item.target?.duration;
  const showPlay = isCreate ? payload.play_count : 0;
  const showLike = isCreate ? payload.like_count : 0;
  const showTag = isCreate ? payload.tag : item.type === 'correction' ? payload.tag : item.target?.cover ? '' : '';
  const showUrl = isCreate
    ? payload.url || (payload.bvid ? `https://www.bilibili.com/video/${payload.bvid}` : '')
    : item.target?.bvid
    ? `https://www.bilibili.com/video/${item.target.bvid}`
    : '';
  const showPublishTime = isCreate ? payload.publish_time : null;

  return (
    <View className={styles.page}>
      {/* 类型横幅 */}
      <View className={styles.typeBanner}>
        <Text className={styles.typeBannerText}>
          {TYPE_LABEL[item.type] || item.type}
        </Text>
      </View>

      {/* create 模式：展示完整动画字段 */}
      {isCreate && (
        <View className={styles.card}>
          <View className={styles.coverWrap}>
            {showCover ? (
              <TaroImage className={styles.cover} src={showCover} mode="aspectFill" />
            ) : (
              <View className={styles.coverPlaceholder}>无封面</View>
            )}
          </View>
          <View className={styles.body}>
            <Text className={styles.title}>{showTitle || '未命名'}</Text>
            <Text className={styles.meta}>{showUp || '未知 UP'} · {showBvid || ''}</Text>
            <Text className={styles.meta}>
              时长 {formatDuration(Number(showDuration) || 0)} · 播放 {showPlay || 0} · 赞 {showLike || 0}
            </Text>
            {showTag && <Text className={styles.tags}>标签：{showTag}</Text>}
            {showUrl && (
              <Text className={styles.link} onClick={() => Taro.setClipboardData({ data: showUrl })}>
                {showUrl}
              </Text>
            )}
            {showPublishTime && (
              <Text className={styles.meta}>发布时间：{formatDateTime(showPublishTime)}</Text>
            )}
          </View>
        </View>
      )}

      {/* correction 模式：原动画 + 新字段对比 */}
      {item.type === 'correction' && (
        <>
          <View className={styles.card}>
            <Text className={styles.sectionTitle}>原动画</Text>
            <View className={styles.coverWrap}>
              {item.target?.cover ? (
                <TaroImage className={styles.cover} src={item.target.cover} mode="aspectFill" />
              ) : (
                <View className={styles.coverPlaceholder}>无封面</View>
              )}
            </View>
            <View className={styles.body}>
              <Text className={styles.title}>{item.target?.title || '未知'}</Text>
              <Text className={styles.meta}>{item.target?.up_name} · {item.target?.bvid}</Text>
              <Text className={styles.meta}>原标签：{item.target?.tag || '—'}</Text>
            </View>
          </View>
          <View className={styles.card}>
            <Text className={styles.sectionTitle}>勘误后</Text>
            <View className={styles.diffRow}>
              <Text className={styles.diffLabel}>标题</Text>
              <Text className={styles.diffOld}>{item.target?.title || '—'}</Text>
              <Text className={styles.diffArrow}>→</Text>
              <Text className={styles.diffNew}>{payload.title || '—'}</Text>
            </View>
            <View className={styles.diffRow}>
              <Text className={styles.diffLabel}>标签</Text>
              <Text className={styles.diffOld}>{item.target?.tag || '—'}</Text>
              <Text className={styles.diffArrow}>→</Text>
              <Text className={styles.diffNew}>{payload.tag || '—'}</Text>
            </View>
          </View>
        </>
      )}

      {/* correction_delete 模式：原动画 + 删除理由 */}
      {item.type === 'correction_delete' && (
        <>
          <View className={styles.card}>
            <Text className={styles.sectionTitle}>将被删除</Text>
            <View className={styles.coverWrap}>
              {item.target?.cover ? (
                <TaroImage className={styles.cover} src={item.target.cover} mode="aspectFill" />
              ) : (
                <View className={styles.coverPlaceholder}>无封面</View>
              )}
            </View>
            <View className={styles.body}>
              <Text className={styles.title}>{item.target?.title || '未知'}</Text>
              <Text className={styles.meta}>{item.target?.up_name} · {item.target?.bvid}</Text>
            </View>
          </View>
          <View className={styles.card}>
            <Text className={styles.sectionTitle}>删除理由</Text>
            <Text className={styles.reason}>{payload.reason || '（无）'}</Text>
          </View>
        </>
      )}

      {/* 提交人备注（correction / correction_delete 共用） */}
      {payload.note && (
        <View className={styles.card}>
          <Text className={styles.sectionTitle}>提交人备注</Text>
          <Text className={styles.reason}>{payload.note}</Text>
        </View>
      )}

      {/* 提交信息 */}
      <View className={styles.card}>
        <Text className={styles.sectionTitle}>提交信息</Text>
        <Text className={styles.meta}>提交人：{(item as any).submitter?.nickName || '匿名用户'}</Text>
        <Text className={styles.meta}>提交时间：{formatDateTime(item.submitted_at)}</Text>
        {item.target_id && (
          <Text className={styles.meta}>目标动画：{item.target_id}</Text>
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
          状态：{item.status === 2 ? '待审' : item.status === 3 ? '已驳回' : '已应用'}
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

      {/* 审核操作 */}
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
              {approveCopy}
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
