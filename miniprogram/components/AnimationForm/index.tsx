import React, { useEffect, useMemo, useState } from 'react';
import Taro from '@tarojs/taro';
import {
  View,
  Text,
  Input,
  Textarea,
  Button,
  Image as TaroImage,
} from '@tarojs/components';
import { SubmissionService, BilibiliService, BilibiliVideoInfo } from '@/services/business';
import { Animation } from '@/types';
import { CATEGORY_GROUPS } from '@/constants/categories';
import { formatNumber } from '@/utils/util';
import styles from './index.module.scss';

export type AnimationFormMode = 'create' | 'correction' | 'delete';

export interface AnimationFormProps {
  /** 'create' 录入 / 'correction' 勘误 / 'delete' 申请删除 */
  mode: AnimationFormMode;
  /** 勘误 / 删除 模式必传：原动画 _id */
  targetId?: string;
  /** 兼容旧 prop 名（建议用 targetId） */
  correctionOf?: string;
  /** 回填数据（勘误时使用；录入/删除时为空或可选） */
  initialValues?: Partial<Animation> | null;
  /** 提交成功回调：参数是新建记录的 _id */
  onSuccess?: (_id: string) => void;
}

/** 把秒数格式化为 "mm:ss" / "h:mm:ss" */
function formatDurationText(sec: number): string {
  if (!sec || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 把任意日期/字符串转成 YYYY-MM-DDTHH:mm 字符串（供 picker 显示） */
// function toPickerDate(value: any): string {
//   if (!value) {
//     const now = new Date();
//     return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
//   }
//   const d = new Date(value);
//   if (isNaN(d.getTime())) return '';
//   return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// }

/** 解析逗号分隔的标签字符串 */
function parseTags(str: string | undefined | null): string[] {
  if (!str) return [];
  return String(str)
    .split(/[,，;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const AnimationForm: React.FC<AnimationFormProps> = ({
  mode,
  targetId,
  correctionOf,
  initialValues,
  onSuccess,
}) => {
  // 兼容旧 prop
  const target = targetId || correctionOf;

  // correction 模式：仅 title + tags
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // create 模式：B 站拉取（bvid/URL 输入 + 拉取结果 + 拉取状态）
  const [bvidInput, setBvidInput] = useState('');
  const [bilibiliInfo, setBilibiliInfo] = useState<BilibiliVideoInfo | null>(null);
  const [bilibiliLoading, setBilibiliLoading] = useState(false);
  const [bilibiliError, setBilibiliError] = useState<string | null>(null);

  // delete 模式：删除理由
  const [reason, setReason] = useState('');

  // correction / delete 模式：备注（可选，给审核管理员的补充说明）
  const [note, setNote] = useState('');

  // correction 模式：标签选择弹窗
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagPickerDraft, setTagPickerDraft] = useState<string[]>([]);

  // correction 模式下"申请删除"子面板控制
  const [deletePhase, setDeletePhase] = useState<'reason' | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const [bvidUnique, setBvidUnique] = useState<boolean | null>(null);
  const [bvidChecking, setBvidChecking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // 回填
  useEffect(() => {
    if (initialValues) {
      setTitle(initialValues.title || '');
      setTags(parseTags(initialValues.tag));
    }
  }, [initialValues]);

  const submitText = useMemo(() => {
    if (mode === 'create') return '提交录入';
    if (mode === 'correction') return '提交勘误';
    return '提交删除申请';
  }, [mode]);

  const clearErr = (key: string) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /** 校验 */
  const validate = (): { ok: boolean; errs: Record<string, string> } => {
    const errs: Record<string, string> = {};
    if (mode === 'correction') {
      if (!title.trim()) errs.title = '请输入动画标题';
      if (tags.length === 0) errs.tag = '请至少选择一个标签';
    } else if (mode === 'delete') {
      if (reason.trim().length < 4) errs.reason = '删除理由至少 4 个字';
    } else {
      // create 模式：必须先拉取到 B 站信息，title 和 tag 都必填
      if (!bilibiliInfo) errs.bvid = '请先输入 bvid 并拉取信息';
      if (!title.trim()) errs.title = '请输入动画标题';
      if (tags.length === 0) errs.tag = '请至少选择一个标签';
      if (bvidUnique === false) errs.bvid = 'bvid 已被占用';
    }
    return { ok: Object.keys(errs).length === 0, errs };
  };

  /** 实时校验 bvid 唯一性（仅 create 模式） */
  const checkBvid = async (bvid: string) => {
    if (mode !== 'create') return;
    if (!bvid || !/^BV1[A-Za-z0-9]{8,}$/.test(bvid.trim())) {
      setBvidUnique(null);
      return;
    }
    setBvidChecking(true);
    try {
      const unique = await SubmissionService.checkBvidUnique(bvid);
      setBvidUnique(unique);
    } finally {
      setBvidChecking(false);
    }
  };

  /** create 模式：从 B 站拉取视频信息 */
  const onFetchBilibili = async () => {
    const raw = bvidInput.trim();
    if (!raw) {
      Taro.showToast({ title: '请输入 bvid 或视频链接', icon: 'none' });
      return;
    }
    setBilibiliLoading(true);
    setBilibiliError(null);
    setBilibiliInfo(null);
    try {
      const info = await BilibiliService.fetchByBvid(raw);
      setBilibiliInfo(info);
      // 默认填入 title（如用户没改过）
      setTitle((prev) => prev || info.title);
      // 用 B 站官方 tag 回填 chips（用户可调整/清空）
      if (Array.isArray(info.tags) && info.tags.length > 0) {
        setTags(info.tags);
        clearErr('tag');
      }
      // 触发 bvid 唯一性校验
      checkBvid(info.bvid);
    } catch (err: any) {
      console.error('[AnimationForm] B 站拉取失败', err);
      setBilibiliError(err?.message || 'B 站信息拉取失败');
    } finally {
      setBilibiliLoading(false);
    }
  };

  const onSubmit = async () => {
    const v = validate();
    setErrors(v.errs);
    if (!v.ok) {
      Taro.showToast({ title: Object.values(v.errs).join('\n'), icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        if (!bilibiliInfo) {
          throw new Error('请先拉取 B 站视频信息');
        }
        if (bvidUnique === false) {
          throw new Error('该 bvid 已被占用');
        }
        const ret = await SubmissionService.create({
          title: title.trim(),
          bvid: bilibiliInfo.bvid,
          up_name: bilibiliInfo.up_name,
          cover: bilibiliInfo.cover,
          duration: bilibiliInfo.duration,
          tag: tags.join(','),
          url: bilibiliInfo.url,
          play_count: bilibiliInfo.play_count,
          like_count: bilibiliInfo.like_count,
          publish_time: bilibiliInfo.publish_time,
        });
        Taro.showToast({ title: '提交成功，等待审核', icon: 'success' });
        if (ret?._id) onSuccess?.(ret._id);
      } else if (mode === 'correction') {
        if (!target) throw new Error('勘误模式缺少原动画 id');
        const ret = await SubmissionService.correct(target, {
          title: title.trim(),
          tag: tags.join(','),
          note: note.trim(),
        });
        Taro.showToast({ title: '勘误已提交，等待审核', icon: 'success' });
        if (ret?._id) onSuccess?.(ret._id);
      } else {
        // delete
        if (!target) throw new Error('删除申请缺少原动画 id');
        const ret = await SubmissionService.remove(target, reason, note.trim());
        Taro.showToast({ title: '删除申请已提交，等待审核', icon: 'success' });
        if (ret?._id) onSuccess?.(ret._id);
      }
    } catch (err: any) {
      console.error('[AnimationForm] 提交失败', err);
      Taro.showToast({ title: err?.message || '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  /** correction 模式：展开"申请删除"子面板 */
  const onRequestDelete = () => {
    if (!target) {
      Taro.showToast({ title: '缺少原动画 id', icon: 'none' });
      return;
    }
    Taro.showModal({
      title: '申请删除',
      content: '申请删除当前动画（需管理员审核），是否继续？',
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          setDeleteReason('');
          setDeletePhase('reason');
        }
      },
    });
  };

  /** 提交删除申请（correction 模式下内嵌的删除流程） */
  const onSubmitDelete = async () => {
    const trimmed = deleteReason.trim();
    if (trimmed.length < 4) {
      Taro.showToast({ title: '删除理由至少 4 个字', icon: 'none' });
      return;
    }
    if (!target) {
      Taro.showToast({ title: '缺少原动画 id', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      const ret = await SubmissionService.remove(target, trimmed);
      Taro.showToast({ title: '删除申请已提交，等待审核', icon: 'success' });
      if (ret?._id) {
        onSuccess?.(ret._id);
      } else {
        setDeletePhase(null);
      }
    } catch (err: any) {
      console.error('[AnimationForm] 申请删除失败', err);
      Taro.showToast({ title: err?.message || '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  // ============== 渲染 ==============

  /** correction 模式：标题 + chips 多选标签 */
  if (mode === 'correction') {
    return (
      <View className={styles.form}>
        <View className={styles.tip}>
          勘误只能修改标题和标签，其他信息保留原状。
        </View>

        {/* 原动画只读卡片 */}
        {initialValues && (
          <View className={styles.origCard}>
            {initialValues.cover ? (
              <TaroImage
                className={styles.origCover}
                src={initialValues.cover}
                mode="aspectFill"
              />
            ) : (
              <View className={styles.origCoverPlaceholder}>无封面</View>
            )}
            <View className={styles.origInfo}>
              <Text className={styles.origLabel}>原动画</Text>
              <Text className={styles.origText} numberOfLines={1}>
                {initialValues.up_name || '未知 UP'} · {initialValues.bvid || ''}
              </Text>
              <Text className={styles.origText} numberOfLines={1}>
                时长 {formatDurationText(Number(initialValues.duration) || 0)}
              </Text>
            </View>
          </View>
        )}

        {/* 标题 */}
        <View className={styles.field}>
          <Text className={styles.label}>
            标题<Text className={styles.required}>*</Text>
          </Text>
          <Input
            className={styles.input}
            placeholder="动画标题"
            value={title}
            maxlength={120}
            onInput={(e) => {
              setTitle(e.detail.value);
              clearErr('title');
            }}
          />
          {errors.title && <Text className={styles.error}>{errors.title}</Text>}
        </View>

        {/* 标签 chips */}
        <View className={styles.field}>
          <Text className={styles.label}>
            标签<Text className={styles.required}>*</Text>
          </Text>
          {/* 已选标签：每个带 × 按钮 */}
          {tags.length > 0 ? (
            <View className={styles.selectedTags}>
              {tags.map((t) => (
                <View key={t} className={styles.selectedTagChip}>
                  <Text className={styles.selectedTagText}>{t}</Text>
                  <View
                    className={styles.selectedTagRemove}
                    onClick={() => {
                      setTags((prev) => prev.filter((x) => x !== t));
                      clearErr('tag');
                    }}
                  >
                    <Text className={styles.selectedTagRemoveIcon}>×</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text className={styles.tagEmptyHint}>尚未选择标签</Text>
          )}
          {/* 选择标签 按钮 */}
          <Button
            className={styles.pickTagBtn}
            onClick={() => {
              setTagPickerDraft([...tags]);
              setTagPickerOpen(true);
            }}
          >
            + 选择标签
          </Button>
          {errors.tag && <Text className={styles.error}>{errors.tag}</Text>}
        </View>

        {/* 备注（可选） */}
        <View className={styles.field}>
          <Text className={styles.label}>
            备注<Text className={styles.optional}>(可选)</Text>
          </Text>
          <Textarea
            className={styles.textarea}
            placeholder="给审核管理员的补充说明（最多 200 字）"
            value={note}
            maxlength={200}
            onInput={(e) => setNote(e.detail.value)}
          />
        </View>

        {/* 申请删除子面板（correction 模式下内嵌） */}
        {deletePhase === 'reason' && (
          <View className={styles.deletePanel}>
            <Text className={styles.deletePanelTitle}>申请删除</Text>
            <Text className={styles.deletePanelTip}>
              填写删除理由，管理员审核通过后该动画将从列表中消失。
            </Text>
            <Textarea
              className={styles.textarea}
              placeholder="请说明删除原因（如：重复录入、违规内容、版权问题等），至少 4 个字"
              value={deleteReason}
              maxlength={200}
              onInput={(e) => setDeleteReason(e.detail.value)}
            />
            <View className={styles.deletePanelActions}>
              <Button
                className={`${styles.btn} ${styles.btnGhost}`}
                disabled={submitting}
                onClick={() => {
                  setDeletePhase(null);
                  setDeleteReason('');
                }}
              >
                取消
              </Button>
              <Button
                className={`${styles.btn} ${styles.btnDanger}`}
                loading={submitting}
                disabled={submitting}
                onClick={onSubmitDelete}
              >
                提交删除申请
              </Button>
            </View>
          </View>
        )}

        {/* 底部操作栏：左 申请删除 / 右 提交勘误 */}
        {deletePhase !== 'reason' && (
          <View className={styles.bottomActions}>
            <Button
              className={`${styles.btn} ${styles.btnDanger}`}
              disabled={submitting}
              onClick={onRequestDelete}
            >
              申请删除
            </Button>
            <Button
              className={`${styles.btn} ${styles.btnPrimary}`}
              loading={submitting}
              disabled={submitting}
              onClick={onSubmit}
            >
              {submitText}
            </Button>
          </View>
        )}

        {/* 标签选择弹窗 */}
        {tagPickerOpen && (
          <View
            className={styles.tagPickerMask}
            onClick={() => setTagPickerOpen(false)}
          >
            <View
              className={styles.tagPickerPanel}
              onClick={(e) => e.stopPropagation()}
            >
              <View className={styles.tagPickerHeader}>
                <Text className={styles.tagPickerTitle}>选择标签</Text>
                <Text className={styles.tagPickerSub}>
                  已选 {tagPickerDraft.length} 个
                </Text>
              </View>
              <View className={styles.tagPickerBody}>
                {CATEGORY_GROUPS.map((group) => (
                  <View key={group.title} className={styles.tagPickerGroup}>
                    <Text className={styles.tagPickerGroupTitle}>
                      {group.title}
                    </Text>
                    <View className={styles.tagPickerItems}>
                      {group.items.map((it) => {
                        const active = tagPickerDraft.includes(it);
                        return (
                          <View
                            key={it}
                            className={`${styles.tagPickerItem} ${active ? styles.tagPickerItemActive : ''}`}
                            onClick={() => {
                              setTagPickerDraft((prev) =>
                                prev.includes(it)
                                  ? prev.filter((x) => x !== it)
                                  : [...prev, it],
                              );
                            }}
                          >
                            <Text
                              className={`${styles.tagPickerItemText} ${active ? styles.tagPickerItemTextActive : ''}`}
                            >
                              {it}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
              <View className={styles.tagPickerActions}>
                <Button
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => setTagPickerOpen(false)}
                >
                  取消
                </Button>
                <Button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => {
                    setTags(tagPickerDraft);
                    clearErr('tag');
                    setTagPickerOpen(false);
                  }}
                >
                  确定
                </Button>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ============== delete 模式：申请删除当前视频 ==============
  if (mode === 'delete') {
    return (
      <View className={styles.form}>
        <View className={styles.tip}>
          申请删除当前动画。请填写删除理由，管理员审核通过后该动画将从列表中消失。
        </View>

        {/* 原动画只读卡片 */}
        {initialValues && (
          <View className={styles.origCard}>
            {initialValues.cover ? (
              <TaroImage
                className={styles.origCover}
                src={initialValues.cover}
                mode="aspectFill"
              />
            ) : (
              <View className={styles.origCoverPlaceholder}>无封面</View>
            )}
            <View className={styles.origInfo}>
              <Text className={styles.origLabel}>原动画</Text>
              <Text className={styles.origText} numberOfLines={1}>
                {initialValues.title || '未知标题'}
              </Text>
              <Text className={styles.origText} numberOfLines={1}>
                {initialValues.up_name || '未知 UP'} · {initialValues.bvid || ''}
              </Text>
            </View>
          </View>
        )}

        {/* 删除理由 */}
        <View className={styles.field}>
          <Text className={styles.label}>
            删除理由<Text className={styles.required}>*</Text>
          </Text>
          <Textarea
            className={styles.textarea}
            placeholder="请说明删除原因（如：重复录入、违规内容、版权问题等），至少 4 个字"
            value={reason}
            maxlength={200}
            onInput={(e) => {
              setReason(e.detail.value);
              clearErr('reason');
            }}
          />
          {errors.reason && <Text className={styles.error}>{errors.reason}</Text>}
        </View>

        {/* 备注（可选） */}
        <View className={styles.field}>
          <Text className={styles.label}>
            备注<Text className={styles.optional}>(可选)</Text>
          </Text>
          <Textarea
            className={styles.textarea}
            placeholder="给审核管理员的补充说明（最多 200 字）"
            value={note}
            maxlength={200}
            onInput={(e) => setNote(e.detail.value)}
          />
        </View>

        <Button
          className={styles.submitBtn}
          loading={submitting}
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitText}
        </Button>
      </View>
    );
  }

  // ============== create 模式：从 B 站拉取信息，仅 title + tag 可编辑 ==============
  return (
    <View className={styles.form}>
      <View className={styles.tip}>
        输入 bvid 或包含 bvid 的 B 站链接，系统自动拉取视频信息。标题和标签可手动调整，其他字段不可编辑。
      </View>

      {/* bvid/URL 输入 + 拉取按钮 */}
      <View className={styles.field}>
        <Text className={styles.label}>
          bvid 或视频链接<Text className={styles.required}>*</Text>
        </Text>
        <View className={styles.bvidInputRow}>
          <Input
            className={`${styles.input} ${styles.bvidInputField}`}
            placeholder="BV1xx... 或 https://www.bilibili.com/video/BV1xx..."
            value={bvidInput}
            maxlength={200}
            onInput={(e) => {
              setBvidInput(e.detail.value);
              setBilibiliError(null);
            }}
          />
          <Button
            className={`${styles.btn} ${styles.btnPrimary} ${styles.fetchBtn}`}
            loading={bilibiliLoading}
            disabled={bilibiliLoading || !bvidInput.trim()}
            onClick={onFetchBilibili}
          >
            拉取信息
          </Button>
        </View>
        {bilibiliError && <Text className={styles.error}>{bilibiliError}</Text>}
        {bilibiliInfo && (
          <Text className={styles.ok}>已识别 bvid：{bilibiliInfo.bvid}</Text>
        )}
        {bvidChecking && <Text className={styles.hint}>校验中…</Text>}
        {bvidUnique === false && (
          <Text className={styles.error}>该 bvid 已被使用或正在审核中</Text>
        )}
        {bvidUnique === true && <Text className={styles.ok}>bvid 可用</Text>}
      </View>

      {/* 拉取成功：只读信息卡片 */}
      {bilibiliInfo && (
        <>
          <View className={styles.infoCard}>
            {bilibiliInfo.cover ? (
              <TaroImage
                className={styles.infoCover}
                src={bilibiliInfo.cover}
                mode="aspectFill"
              />
            ) : (
              <View className={styles.infoCoverPlaceholder}>无封面</View>
            )}
            <View className={styles.infoRows}>
              <View className={styles.infoRow}>
                <Text className={styles.infoLabel}>UP 主</Text>
                <Text className={styles.infoValue} numberOfLines={1}>
                  {bilibiliInfo.up_name || '未知'}
                </Text>
              </View>
              <View className={styles.infoRow}>
                <Text className={styles.infoLabel}>时长</Text>
                <Text className={styles.infoValue}>
                  {formatDurationText(bilibiliInfo.duration) || '-'}
                </Text>
              </View>
              <View className={styles.infoRow}>
                <Text className={styles.infoLabel}>播放 / 点赞</Text>
                <Text className={styles.infoValue}>
                  {formatNumber(bilibiliInfo.play_count)} / {formatNumber(bilibiliInfo.like_count)}
                </Text>
              </View>
              <View className={styles.infoRow}>
                <Text className={styles.infoLabel}>发布时间</Text>
                <Text className={styles.infoValue}>{bilibiliInfo.publish_time || '-'}</Text>
              </View>
              <View className={styles.infoRow}>
                <Text className={styles.infoLabel}>原链接</Text>
                <Text className={styles.infoValue} numberOfLines={1}>
                  {bilibiliInfo.url}
                </Text>
              </View>
            </View>
          </View>

          {/* 标题：可编辑 */}
          <View className={styles.field}>
            <Text className={styles.label}>
              标题<Text className={styles.required}>*</Text>
            </Text>
            <Input
              className={styles.input}
              placeholder="动画标题"
              value={title}
              maxlength={120}
              onInput={(e) => {
                setTitle(e.detail.value);
                clearErr('title');
              }}
            />
            {errors.title && <Text className={styles.error}>{errors.title}</Text>}
          </View>

          {/* 标签：chips 多选（与 correction 模式同款） */}
          <View className={styles.field}>
            <Text className={styles.label}>
              标签<Text className={styles.required}>*</Text>
            </Text>
            {tags.length > 0 ? (
              <View className={styles.selectedTags}>
                {tags.map((t) => (
                  <View key={t} className={styles.selectedTagChip}>
                    <Text className={styles.selectedTagText}>{t}</Text>
                    <View
                      className={styles.selectedTagRemove}
                      onClick={() => {
                        setTags((prev) => prev.filter((x) => x !== t));
                        clearErr('tag');
                      }}
                    >
                      <Text className={styles.selectedTagRemoveIcon}>×</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text className={styles.tagEmptyHint}>尚未选择标签</Text>
            )}
            <Button
              className={styles.pickTagBtn}
              onClick={() => {
                setTagPickerDraft([...tags]);
                setTagPickerOpen(true);
              }}
            >
              + 选择标签
            </Button>
            {errors.tag && <Text className={styles.error}>{errors.tag}</Text>}
          </View>

          {/* 备注（可选） */}
          <View className={styles.field}>
            <Text className={styles.label}>
              备注<Text className={styles.optional}>(可选)</Text>
            </Text>
            <Textarea
              className={styles.textarea}
              placeholder="给审核管理员的补充说明（最多 200 字）"
              value={note}
              maxlength={200}
              onInput={(e) => setNote(e.detail.value)}
            />
          </View>

          <Button
            className={styles.submitBtn}
            loading={submitting}
            disabled={submitting}
            onClick={onSubmit}
          >
            {submitText}
          </Button>
        </>
      )}

      {/* 标签选择弹窗（create 模式复用） */}
      {tagPickerOpen && (
        <View
          className={styles.tagPickerMask}
          onClick={() => setTagPickerOpen(false)}
        >
          <View
            className={styles.tagPickerPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <View className={styles.tagPickerHeader}>
              <Text className={styles.tagPickerTitle}>选择标签</Text>
              <Text className={styles.tagPickerSub}>
                已选 {tagPickerDraft.length} 个
              </Text>
            </View>
            <View className={styles.tagPickerBody}>
              {CATEGORY_GROUPS.map((group) => (
                <View key={group.title} className={styles.tagPickerGroup}>
                  <Text className={styles.tagPickerGroupTitle}>
                    {group.title}
                  </Text>
                  <View className={styles.tagPickerItems}>
                    {group.items.map((it) => {
                      const active = tagPickerDraft.includes(it);
                      return (
                        <View
                          key={it}
                          className={`${styles.tagPickerItem} ${active ? styles.tagPickerItemActive : ''}`}
                          onClick={() => {
                            setTagPickerDraft((prev) =>
                              prev.includes(it)
                                ? prev.filter((x) => x !== it)
                                : [...prev, it],
                            );
                          }}
                        >
                          <Text
                            className={`${styles.tagPickerItemText} ${active ? styles.tagPickerItemTextActive : ''}`}
                          >
                            {it}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
            <View className={styles.tagPickerActions}>
              <Button
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setTagPickerOpen(false)}
              >
                取消
              </Button>
              <Button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  setTags(tagPickerDraft);
                  clearErr('tag');
                  setTagPickerOpen(false);
                }}
              >
                确定
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default AnimationForm;
