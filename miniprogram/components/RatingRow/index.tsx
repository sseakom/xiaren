import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import StarRating from '@/components/StarRating';
import styles from './index.module.scss';

export interface RatingRowProps {
  label?: string;
  value?: number;
  size?: number;
  disabled?: boolean;
  className?: string;
  onChange?: (value: number) => void;
}

const RatingRow: React.FC<RatingRowProps> = ({
  label = '我的评分',
  value = 0,
  size = 40,
  disabled = false,
  className,
  onChange,
}) => {
  const safeValue = Math.max(0, value);

  return (
    <View className={classnames(styles.ratingRow, className)}>
      <Text className={styles.title}>{label}</Text>
      <View className={styles.stars}>
        <StarRating
          value={safeValue}
          disabled={disabled}
          onChange={onChange}
          showScore={false}
          size={size}
        />
      </View>
      <View className={styles.badge}>
        <Text className={styles.badgeValue}>
          {safeValue > 0 ? safeValue.toFixed(1) : '--'}
        </Text>
      </View>
    </View>
  );
};

export default RatingRow;
