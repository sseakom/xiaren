import React, { useState } from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

export interface StarRatingProps {
  /** 当前评分 (0-5，步长 0.5) */
  value?: number;
  /** 最大分数（用于显示 "/maxScore"） */
  maxScore?: number;
  /** 星数 */
  count?: number;
  /** 是否显示分数文字 */
  showScore?: boolean;
  /** 是否禁用交互 */
  disabled?: boolean;
  /** 星星大小（rpx） */
  size?: number;
  /** 自定义提示文字 */
  hint?: string;
  /** 变更回调 */
  onChange?: (value: number) => void;
}

const StarRating: React.FC<StarRatingProps> = ({
  value = 0,
  maxScore = 5,
  count = 5,
  showScore = true,
  disabled = false,
  size = 36,
  hint,
  onChange,
}) => {
  const [innerValue, setInnerValue] = useState(value);
  const stars = Array.from({ length: count }, (_, i) => i + 1);

  const setScore = (v: number) => {
    if (disabled) return;
    const safe = Math.max(0, Math.min(maxScore, v));
    setInnerValue(safe);
    onChange?.(safe);
  };

  return (
    <View className={classnames(styles.starRating, disabled && styles.disabled)}>
      <View className={styles.starsRow} style={{ gap: `${Math.round(size / 4)}rpx` }}>
        {stars.map((s) => {
          const filled = innerValue >= s;
          const half = !filled && innerValue >= s - 0.5;
          return (
            <View
              key={s}
              className={styles.starWrapper}
              style={{ width: `${size + 8}rpx`, height: `${size + 8}rpx` }}
            >
              {/* 背景灰星 */}
              <Text
                className={styles.starBg}
                style={{ fontSize: `${size}rpx`, lineHeight: `${size + 8}rpx` }}
              >
                ★
              </Text>
              {/* 前景高亮（用宽度控制） */}
              {(filled || half) && (
                <View
                  className={styles.starFgWrap}
                  style={{
                    width: filled ? '100%' : '50%',
                    fontSize: `${size}rpx`,
                    lineHeight: `${size + 8}rpx`,
                  }}
                >
                  <Text className={styles.starFg}>★</Text>
                </View>
              )}
              {/* 左半点击区 */}
              {!disabled && (
                <View
                  className={styles.hitAreaLeft}
                  onClick={() => setScore(s - 0.5)}
                />
              )}
              {/* 右半点击区 */}
              {!disabled && (
                <View
                  className={styles.hitAreaRight}
                  onClick={() => setScore(s)}
                />
              )}
            </View>
          );
        })}
      </View>

      {showScore && (
        <View className={styles.scoreText}>
          <Text
            className={classnames(
              styles.scoreValue,
              innerValue > 0 && styles.scoreValueActive,
            )}
          >
            {innerValue > 0 ? innerValue.toFixed(1) : '--'}
          </Text>
          {maxScore > 0 && <Text className={styles.scoreUnit}>/ {maxScore}</Text>}
        </View>
      )}

      {hint && <Text className={styles.hint}>{hint}</Text>}
    </View>
  );
};

export default StarRating;
