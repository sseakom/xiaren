import React from 'react';
import { View } from '@tarojs/components';
import { Tag } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/tag/style/style.css';
import { THEME_PRIMARY_COLOR } from '@/constants/theme';
import styles from './index.module.scss';
import classnames from 'classnames';

export interface TagRowProps {
  tags: string[];
  nowarp?: boolean;
}

const TagRow: React.FC<TagRowProps> = ({ tags, nowarp = false }) => {
  if (!tags.length) return null;

  return (
    <View className={classnames(styles.tagRow, nowarp ? styles.nowarp : '')}>
      {tags.map((tag) => (
        <Tag
          key={tag}
          background={THEME_PRIMARY_COLOR}
          color={THEME_PRIMARY_COLOR}
          className={styles.nutTag}
        >
          {tag}
        </Tag>
      ))}
    </View>
  );
};

export default React.memo(TagRow);
