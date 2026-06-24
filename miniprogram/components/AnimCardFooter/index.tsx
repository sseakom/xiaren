import React from 'react';
import { View, Text } from '@tarojs/components';
import { Animation } from '@/types';
import AppIcon from '@/components/AppIcon';
import { formatNumber } from '@/utils/util';

export interface AnimCardFooterProps {
  item: Animation;
  /** 页面 CSS Modules 样式表（复用调用方 scss，避免样式迁移） */
  styles: Record<string, string>;
}

/**
 * AnimCard 的默认底部内容：标签 + 作者·播放·评分
 * 消除 index / search 两个页面中完全相同的 footer JSX 重复。
 */
const AnimCardFooter: React.FC<AnimCardFooterProps> = ({ item, styles }) => (
  <>
    {item.tags?.length ? (
      <View className={styles.animtag}>
        {item.tags.map((tag: string) => (
          <Text key={tag} className={styles.animTag}>
            {tag}
          </Text>
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
