import React, { useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { View } from '@tarojs/components';
import AnimationForm, {
  type AnimationFormMode,
} from '@/components/AnimationForm';
import { AnimationService } from '@/services/business';
import { Animation } from '@/types';
import styles from './index.module.scss';

const AnimationFormPage: React.FC = () => {
  const router = useRouter();
  const params = (router.params || {}) as {
    mode?: string;
    correction_of?: string;
    id?: string;
  };
  // mode 优先级：URL 参数 > correction_of 推断 > create
  const mode: AnimationFormMode =
    params.mode === 'correction'
      ? 'correction'
      : params.correction_of
      ? 'correction'
      : 'create';

  const [initial, setInitial] = useState<Partial<Animation> | null>(null);
  const [loaded, setLoaded] = useState(mode === 'create');

  React.useEffect(() => {
    if (mode === 'correction') {
      const id = params.correction_of || params.id;
      if (!id) {
        Taro.showToast({ title: '缺少原动画 id', icon: 'none' });
        return;
      }
      AnimationService.getById(id)
        .then((data) => {
          if (!data) {
            Taro.showToast({ title: '原动画不存在', icon: 'none' });
            return;
          }
          setInitial(data as Animation);
          setLoaded(true);
        })
        .catch((err) => {
          console.error('[animation-form] 加载原动画失败', err);
          Taro.showToast({ title: '加载失败', icon: 'none' });
        });
    }
  }, [mode, params.correction_of, params.id]);

  const onSuccess = () => {
    setTimeout(() => {
      Taro.navigateBack();
    }, 1200);
  };

  return (
    <View className={styles.page}>
      {mode === 'correction' && !loaded ? (
        <View className={styles.loading}>正在加载原动画…</View>
      ) : (
        <AnimationForm
          mode={mode}
          correctionOf={params.correction_of || params.id}
          initialValues={initial}
          onSuccess={onSuccess}
        />
      )}
    </View>
  );
};

export default AnimationFormPage;
