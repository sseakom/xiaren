import React from 'react';
import { Empty } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/empty/style/style.css';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  showBtn?: boolean;
  btnText?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title = '暂无内容',
  description = '',
  showBtn = false,
  btnText = '去看看',
  onAction,
}) => {
  return (
    <Empty
      image={icon}
      imageSize="100rpx"
      title={title}
      description={description}
      status="empty"
      actions={
        showBtn
          ? [{ text: btnText, onClick: onAction ? () => onAction : undefined }]
          : undefined
      }
    />
  );
};

export default EmptyState;
