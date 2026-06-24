import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import { Rate } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/rate/style/style.css';
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
  const safeValue = Math.min(Math.max(value, 0), maxScore);
  // 统一使用 CSS 变量控制尺寸，避免与 NutUI 的 small/large 预设叠加后产生错位。
  const rateStyle = {
    '--nutui-rate-icon-size': `${size}rpx`,
    '--nutui-rate-item-margin': `${Math.max(4, Math.round(size / 5))}rpx`,
  } as React.CSSProperties;
  const displayScore = safeValue > 0 ? safeValue.toFixed(1) : '--';

  return (
    <View className={classnames(styles.starRating, disabled && styles.disabled)}>
      <Rate
        className={styles.rate}
        style={rateStyle}
        value={safeValue}
        count={count}
        size="normal"
        allowHalf
        readOnly={disabled}
        onChange={(next) => onChange?.(Number(next))}
      />

      {showScore && (
        <View className={styles.scoreText}>
          <Text
            className={classnames(
              styles.scoreValue,
              safeValue > 0 && styles.scoreValueActive,
            )}
          >
            {displayScore}
          </Text>
          {maxScore > 0 && <Text className={styles.scoreUnit}>/ {maxScore}</Text>}
        </View>
      )}

      {hint && <Text className={styles.hint}>{hint}</Text>}
    </View>
  );
};

export default StarRating;
