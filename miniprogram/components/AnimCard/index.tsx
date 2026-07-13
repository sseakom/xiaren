import React, { useState } from 'react';
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
  onClick?: (item: Animation) => void;
  /** 封面占位图（CDN fallback） */
  coverFallback?: string;
}

/** 封面区域：lazyLoad + error 降级 + 加载占位 */
const Cover: React.FC<{
  src: string;
  duration?: number | string | null;
  score?: number | null;
}> = ({ src, duration, score }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <View className={styles.animCoverWrap}>
      {src && !imgError ? (
        <Image
          className={styles.animCover}
          src={src}
          mode="aspectFill"
          lazyLoad
          onError={() => setImgError(true)}
          onLoad={() => setImgLoaded(true)}
          style={imgLoaded ? undefined : { opacity: 0 }}
        />
      ) : null}
      {/* 加载中 / 加载失败 占位 */}
      {(!imgLoaded || imgError) && (
        <View className={styles.animCoverPlaceholder}>
          <AppIcon name={imgError ? 'movie' : 'movie'} size="48rpx" className={styles.coverPlaceholderIcon} />
        </View>
      )}
      {duration ? (
        <View className={styles.animDuration}>
          {formatDuration(duration)}
        </View>
      ) : null}
      {typeof score === 'number' && !Number.isNaN(score) ? (
        <View className={styles.coverScore}>
          <Text className={styles.coverScoreText}>{score.toFixed(1)}</Text>
        </View>
      ) : null}
    </View>
  );
};

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
  coverFallback,
}) => {
  const handleClick = () => {
    if (onClick && item.bvid) onClick(item);
  };

  const coverSrc = item.cover || coverFallback || '';

  return (
    <View
      className={styles.animCard}
      onClick={onClick ? handleClick : undefined}
      hoverClass={onClick ? styles.hover : undefined}
    >
      <Cover src={coverSrc} duration={item.duration} score={item.score} />
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
