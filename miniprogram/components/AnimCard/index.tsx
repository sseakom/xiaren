import React from 'react';
import { View, Image, Text } from '@tarojs/components';
import { Animation } from '@/types';
import { formatDuration, formatNumber, parseTags } from '@/utils/util';
import AppIcon from '@/components/AppIcon';
import TagRow from '@/components/TagRow';
import styles from './index.module.scss';

export interface AnimCardProps {
  /** 动画数据 */
  item: Animation;
  /** 点击回调（不传则不响应） */
  onClick?: (bvid: string) => void;
  /**
   * 排行榜序号（>=0 时显示在封面左上角）
   */
  rank?: number;
  /** 封面占位图（CDN fallback） */
  coverFallback?: string;
}

/** footer：标签 + 作者·播放·弹幕·评分 */
const Footer: React.FC<{ item: Animation }> = ({ item }) => (
  <>
    <TagRow tags={parseTags(item.tags ?? item.tag) || []} nowarp />
    <View className={styles.animMeta}>
      <Text className={styles.metaAuthor} numberOfLines={1}>
        {item.up_name}
      </Text>
      <Text className={styles.metaDot}>·</Text>
      <Text className={styles.metaPlay}>
        {formatNumber(item.play_count || 0)} 播放
      </Text>
      <Text className={styles.metaDot}>·</Text>
      <Text className={styles.metaDanmaku}>
        {formatNumber(item.danmaku_count || 0)}
        弹幕</Text>
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

/**
 * 通用动画卡片
 *  - 公共结构：coverWrap（封面 + 可选时长） + info（标题 + footer）
 */
const AnimCard: React.FC<AnimCardProps> = ({
  item,
  onClick,
  rank,
  coverFallback,
}) => {
  const handleClick = () => {
    const target = item.bvid || item._id;
    if (onClick && target) onClick(target);
  };

  return (
    <View
      className={styles.animCard}
      onClick={onClick ? handleClick : undefined}
      hoverClass={onClick ? styles.hover : undefined}
    >
      <View className={styles.animCoverWrap}>
        <Image
          className={styles.animCover}
          src={item.cover || coverFallback || ''}
          mode="aspectFill"
          lazyLoad
        />
        {item.duration ? (
          <View className={styles.animDuration}>
            {formatDuration(item.duration)}
          </View>
        ) : null}
        {typeof rank === 'number' ? (
          <View className={styles.animRank}>
            <Text className={rank < 3 ? styles.rankTop : styles.rankNormal}>
              {rank + 1}
            </Text>
          </View>
        ) : null}
      </View>
      <View className={styles.animInfo}>
        <View className={styles.animTitle}>
          <Text className={styles.animTitleText}>{item.title}</Text>
        </View>
        <View className={styles.animSubTitle}>
          <Text className={styles.animSubTitleText}>{item.original_title}</Text>
        </View>
        <Footer item={item} />
      </View>
    </View>
  );
};

export default React.memo(AnimCard);
