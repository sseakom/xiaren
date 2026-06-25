import React from 'react';
import { View } from '@tarojs/components';
import { Tag } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/tag/style/style.css';
import styles from './index.module.scss';

export interface TagRowProps {
  tags: string[];
}

const TagRow: React.FC<TagRowProps> = ({ tags }) => {
  if (!tags.length) return null;

  return (
    <View className={styles.tagRow}>
      {tags.map((tag) => (
        <Tag key={tag} background="#28b894" color="#28b894" className={styles.nutTag}>
          {tag}
        </Tag>
      ))}
    </View>
  );
};

export default React.memo(TagRow);
