import React, { ReactNode } from 'react';
import { View, Image, Text } from '@tarojs/components';
import { Animation } from '@/types';
import { formatDuration } from '@/utils/util';
import styles from './index.module.scss';

export interface AnimCardProps {
  /** 动画数据 */
  item: Animation;
  /** 点击回调（不传则不响应） */
  onClick?: (bvid: string) => void;
  /**
   * 自定义卡片底部内容（标题以下区域）
   * - 不传：什么都不显示
   * - 传 ReactNode：由调用方决定显示 tag / meta / stats 等
   */
  footer?: ReactNode;
  /**
   * 排行榜序号（>=0 时显示在封面左上角）
   * - 用于首页的"按播放量排序"tab 等
   */
  rank?: number;
  /** 封面占位图（CDN fallback） */
  coverFallback?: string;
}

/**
 * 通用动画卡片
 *  - 公共结构：coverWrap（封面 + 可选时长） + info（标题 + 自定义 footer）
 *  - 不一样的底部由调用方通过 footer 注入：
 *      index 页：tag + 作者·播放·评分
 *      search 页：作者 + 播放/点赞统计
 */
const AnimCard: React.FC<AnimCardProps> = ({
  item,
  onClick,
  footer,
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
        {footer}
      </View>
    </View>
  );
};

export default React.memo(AnimCard);
