import React from 'react';
import { View, Text } from '@tarojs/components';
import { Tag } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/tag/style/style.css';
import { Animation } from '@/types';
import AppIcon from '@/components/AppIcon';
import { formatNumber } from '@/utils/util';
import styles from './index.module.scss';

export interface AnimCardFooterProps {
  item: Animation;
}

const AnimCardFooter: React.FC<AnimCardFooterProps> = ({ item }) => (
  <>
    {item.tags?.length ? (
      <View className={styles.animtag}>
        {item.tags.map((tag: string) => (
          <Tag key={tag} background="#28b894" color="#28b894" className={styles.animNutTag}>
            {tag}
          </Tag>
        ))}
      </View>
    ) : null}
    <View className={styles.animMeta}>
      <Text className={styles.metaAuthor} numberOfLines={1}>
        {item.up_name}
      </Text>
      <Text className={styles.metaDot}>·</Text>
      <Text className={styles.metaPlay}>
        {formatNumber(item.play_count || 0)} 播放
      </Text>
      {item.score != null ? (
        <>
          <Text className={styles.metaDot}>·</Text>
          <View className={styles.metaScore}>
            <AppIcon name="rating" size="20rpx" className={styles.metaScoreIcon} />
            <Text>{item.score.toFixed(1)}</Text>
          </View>
        </>
      ) : null}
    </View>
  </>
);

export default React.memo(AnimCardFooter);
