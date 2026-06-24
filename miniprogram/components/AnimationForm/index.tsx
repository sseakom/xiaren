import React, { useEffect, useMemo, useState } from 'react';
import Taro from '@tarojs/taro';
import {
  View,
  Text,
  Input,
  Textarea,
  Button,
  Picker,
  Image as TaroImage,
} from '@tarojs/components';
import { SubmissionService } from '@/services/business';
import { Animation } from '@/types';
import { CATEGORY_GROUPS } from '@/constants/categories';
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

/** 把 "1:23" / "1:23:45" / "285" 解析成秒数 */
function parseDuration(str: string): number {
  const s = String(str || '').trim();
  if (!s) return 0;
  if (/^\d+(:\d+){1,2}$/.test(s)) {
    const parts = s.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return 0;
}

/** 把任意日期/字符串转成 YYYY-MM-DDTHH:mm 字符串（供 picker 显示） */
function toPickerDate(value: any): string {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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

  // create 模式：完整字段
  const [form, setForm] = useState({
    bvid: '',
    up_name: '',
    cover: '',
    durationText: '',
    tag: '',
    url: '',
    play_count: 0,
    like_count: 0,
    publishTimeText: '',
  });

  // delete 模式：删除理由
  const [reason, setReason] = useState('');

  // correction / delete 模式：备注（可选，给审核管理员的补充说明）
  const [note, setNote] = useState('');

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
      const dur = Number(initialValues.duration) || 0;
      setForm({
        bvid: initialValues.bvid || '',
        up_name: initialValues.up_name || '',
        cover: initialValues.cover || '',
        durationText: formatDurationText(dur),
        tag: initialValues.tag || '',
        url: initialValues.url || '',
        play_count: Number(initialValues.play_count) || 0,
        like_count: Number(initialValues.like_count) || 0,
        publishTimeText: toPickerDate(initialValues.publish_time),
      });
    }
  }, [initialValues]);

  const submitText = useMemo(() => {
    if (mode === 'create') return '提交录入';
    if (mode === 'correction') return '提交勘误';
    return '提交删除申请';
  }, [mode]);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => {
      if (!prev[k as string]) return prev;
      const next = { ...prev };
      delete next[k as string];
      return next;
    });
  };

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
      if (!form.bvid.trim()) errs.bvid = '请输入 bvid';
      else if (!/^BV1[A-Za-z0-9]{8,}$/.test(form.bvid.trim())) errs.bvid = 'bvid 格式不正确';
      if (!form.up_name.trim()) errs.up_name = '请输入 UP 主名称';
      if (!form.cover.trim()) errs.cover = '请输入封面 URL';
      else if (!/^https?:\/\//.test(form.cover.trim())) errs.cover = '封面 URL 必须以 http(s) 开头';
      const dur = parseDuration(form.durationText);
      if (dur <= 0) errs.durationText = '请输入有效的时长（mm:ss 或 h:mm:ss）';
      if (!form.tag.trim()) errs.tag = '请输入标签（逗号分隔）';
      if (!form.publishTimeText) errs.publishTimeText = '请选择发布时间';
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

  const onSubmit = async () => {
    const v = validate();
    setErrors(v.errs);
    if (!v.ok) {
      Taro.showToast({ title: '请完善表单', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const duration = parseDuration(form.durationText);
        const ret = await SubmissionService.create({
          title: title.trim() || initialValues?.title || '',
          bvid: form.bvid.trim(),
          up_name: form.up_name.trim(),
          cover: form.cover.trim(),
          duration,
          tag: form.tag.trim(),
          url: form.url?.trim() || undefined,
          play_count: form.play_count || 0,
          like_count: form.like_count || 0,
          publish_time: new Date(form.publishTimeText).toISOString(),
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
          <View className={styles.tagGroups}>
            {CATEGORY_GROUPS.map((group) => (
              <View key={group.title} className={styles.tagGroup}>
                <Text className={styles.tagGroupTitle}>{group.title}</Text>
                <View className={styles.tagList}>
                  {group.items.map((it) => {
                    const active = tags.includes(it);
                    return (
                      <View
                        key={it}
                        className={`${styles.tagChip} ${active ? styles.tagChipActive : ''}`}
                        onClick={() => {
                          setTags((prev) =>
                            prev.includes(it)
                              ? prev.filter((t) => t !== it)
                              : [...prev, it],
                          );
                          clearErr('tag');
                        }}
                      >
                        <Text
                          className={`${styles.tagChipText} ${active ? styles.tagChipTextActive : ''}`}
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
          {tags.length > 0 && (
            <View className={styles.selectedHint}>
              <Text className={styles.selectedHintText}>
                已选 {tags.length} 个：{tags.join('、')}
              </Text>
            </View>
          )}
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

  // ============== create 模式：完整录入表单 ==============
  return (
    <View className={styles.form}>
      <View className={styles.tip}>
        提交后进入审核队列，管理员通过后才会出现在首页。
      </View>

      {/* bvid */}
      <View className={styles.field}>
        <Text className={styles.label}>
          bvid<Text className={styles.required}>*</Text>
        </Text>
        <Input
          className={styles.input}
          placeholder="BV1xx411c7xx"
          value={form.bvid}
          maxlength={16}
          onInput={(e) => setField('bvid', e.detail.value)}
          onBlur={(e) => checkBvid(e.detail.value)}
        />
        {bvidChecking && <Text className={styles.hint}>校验中…</Text>}
        {bvidUnique === false && (
          <Text className={styles.error}>该 bvid 已被使用或正在审核中</Text>
        )}
        {bvidUnique === true && (
          <Text className={styles.ok}>bvid 可用</Text>
        )}
        {errors.bvid && <Text className={styles.error}>{errors.bvid}</Text>}
      </View>

      {/* UP 主 */}
      <View className={styles.field}>
        <Text className={styles.label}>
          UP 主<Text className={styles.required}>*</Text>
        </Text>
        <Input
          className={styles.input}
          placeholder="UP 主名称"
          value={form.up_name}
          maxlength={60}
          onInput={(e) => setField('up_name', e.detail.value)}
        />
        {errors.up_name && <Text className={styles.error}>{errors.up_name}</Text>}
      </View>

      {/* 封面 */}
      <View className={styles.field}>
        <Text className={styles.label}>
          封面 URL<Text className={styles.required}>*</Text>
        </Text>
        <Input
          className={styles.input}
          placeholder="https://…"
          value={form.cover}
          onInput={(e) => setField('cover', e.detail.value)}
        />
        {errors.cover && <Text className={styles.error}>{errors.cover}</Text>}
        {form.cover && /^https?:\/\//.test(form.cover) && (
          <View className={styles.coverPreviewWrap}>
            <TaroImage
              className={styles.coverPreview}
              src={form.cover}
              mode="aspectFill"
            />
          </View>
        )}
      </View>

      {/* 时长 */}
      <View className={styles.field}>
        <Text className={styles.label}>
          时长 (mm:ss)<Text className={styles.required}>*</Text>
        </Text>
        <Input
          className={styles.input}
          placeholder="例：3:42 或 1:02:08"
          value={form.durationText}
          onInput={(e) => setField('durationText', e.detail.value)}
        />
        {errors.durationText && <Text className={styles.error}>{errors.durationText}</Text>}
      </View>

      {/* 标签（录入模式保持自由输入） */}
      <View className={styles.field}>
        <Text className={styles.label}>
          标签<Text className={styles.required}>*</Text>
        </Text>
        <Textarea
          className={styles.textarea}
          placeholder="逗号分隔，如：沙雕,修仙,爆笑"
          value={form.tag}
          maxlength={200}
          onInput={(e) => setField('tag', e.detail.value)}
        />
        {errors.tag && <Text className={styles.error}>{errors.tag}</Text>}
      </View>

      {/* 播放/点赞（可选） */}
      <View className={styles.row}>
        <View className={styles.col}>
          <Text className={styles.label}>播放数</Text>
          <Input
            className={styles.input}
            type="number"
            placeholder="0"
            value={String(form.play_count || '')}
            onInput={(e) => setField('play_count', Number(e.detail.value) || 0)}
          />
        </View>
        <View className={styles.col}>
          <Text className={styles.label}>点赞数</Text>
          <Input
            className={styles.input}
            type="number"
            placeholder="0"
            value={String(form.like_count || '')}
            onInput={(e) => setField('like_count', Number(e.detail.value) || 0)}
          />
        </View>
      </View>

      {/* 发布时间 */}
      <View className={styles.field}>
        <Text className={styles.label}>
          发布时间<Text className={styles.required}>*</Text>
        </Text>
        <Picker
          mode="date"
          value={form.publishTimeText}
          onChange={(e: any) => setField('publishTimeText', e.detail.value)}
        >
          <View className={styles.pickerInput}>
            {form.publishTimeText || '点击选择日期'}
          </View>
        </Picker>
        {errors.publishTimeText && (
          <Text className={styles.error}>{errors.publishTimeText}</Text>
        )}
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
};

export default AnimationForm;
