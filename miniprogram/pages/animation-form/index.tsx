import React, { useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { View } from '@tarojs/components';
import AnimationForm, {
  type AnimationFormMode,
} from '@/components/AnimationForm';
import { AnimationService } from '@/services/business';
import { Animation } from '@/types';
import { toastError } from '@/utils/error';
import styles from './index.module.scss';

function parseMode(raw: string | undefined, hasTarget: boolean): AnimationFormMode {
  if (raw === 'create' || raw === 'correction' || raw === 'delete') return raw;
  // 兼容：correction_of 有值默认走 correction
  if (hasTarget) return 'correction';
  return 'create';
}

const AnimationFormPage: React.FC = () => {
  const router = useRouter();
  const params = (router.params || {}) as {
    mode?: string;
    correction_of?: string;
    target_id?: string;
    id?: string;
  };
  // 兼容多个参数名：correction_of / target_id / id
  const target = params.correction_of || params.target_id || params.id;
  const mode: AnimationFormMode = parseMode(params.mode, !!target);

  const [initial, setInitial] = useState<Partial<Animation> | null>(null);
  const [loaded, setLoaded] = useState(mode === 'create');

  React.useEffect(() => {
    if (mode === 'create') return;
    if (!target) {
      Taro.showToast({ title: '缺少原动画 id', icon: 'none' });
      return;
    }
    AnimationService.getById(target)
      .then((data) => {
        if (!data) {
          Taro.showToast({ title: '原动画不存在', icon: 'none' });
          return;
        }
        setInitial(data as Animation);
        setLoaded(true);
      })
      .catch((err) => {
        toastError('[animation-form]', err);
      });
  }, [mode, target]);

  const onSuccess = () => {
    setTimeout(() => {
      Taro.navigateBack();
    }, 1200);
  };

  const title =
    mode === 'create' ? '录入动画' : mode === 'correction' ? '勘误动画' : '申请删除';

  React.useEffect(() => {
    Taro.setNavigationBarTitle({ title });
  }, [title]);

  return (
    <View className={styles.page}>
      {mode !== 'create' && !loaded ? (
        <View className={styles.loading}>正在加载原动画…</View>
      ) : (
        <AnimationForm
          mode={mode}
          targetId={target}
          initialValues={initial}
          onSuccess={onSuccess}
        />
      )}
    </View>
  );
};

export default AnimationFormPage;
