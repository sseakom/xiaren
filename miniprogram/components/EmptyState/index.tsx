import React from 'react';
import { View, Text, Button } from '@tarojs/components';
import AppIcon from '@/components/AppIcon';
import styles from './index.module.scss';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  showBtn?: boolean;
  btnText?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <AppIcon name="empty" size="100rpx" />,
  title = '暂无内容',
  description = '',
  showBtn = false,
  btnText = '去看看',
  onAction,
}) => {
  return (
    <View className={styles.emptyState}>
      <View className={styles.emptyIcon}>{icon}</View>
      <Text className={styles.emptyTitle}>{title}</Text>
      {description ? (
        <Text className={styles.emptyDesc}>{description}</Text>
      ) : null}
      {showBtn ? (
        <View className={styles.emptyAction}>
          <Button
            className={styles.btnPrimary}
            onClick={onAction}
            size="mini"
          >
            {btnText}
          </Button>
        </View>
      ) : null}
    </View>
  );
};

export default EmptyState;
