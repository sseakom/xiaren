import React, { useMemo } from 'react';
import { View, Text } from '@tarojs/components';
import { Progress } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/progress/style/style.css';
import { ScoreDistribution } from '@/types';
import AppIcon from '@/components/AppIcon';
import { THEME_PRIMARY_COLOR } from '@/constants/theme';
import styles from './index.module.scss';

export interface ScoreChartProps {
  distribution: ScoreDistribution;
  /** 紧凑模式：去掉标题 + 减小行距 + 弱化元信息，适配左右两列布局 */
  compact?: boolean;
}

const ScoreChart: React.FC<ScoreChartProps> = ({ distribution, compact = false }) => {
  const data = useMemo(() => {
    const defaultLevels = [5, 4, 3, 2, 1];
    const bucketMap = defaultLevels.reduce<Record<number, number>>((acc, score) => {
      acc[score] = 0;
      return acc;
    }, {});

    if (distribution && Object.keys(distribution).length > 0) {
      Object.entries(distribution).forEach(([scoreText, count]) => {
        const score = Number(scoreText);
        if (Number.isNaN(score) || !count) return;
        const bucket = Math.min(5, Math.max(1, Math.ceil(score)));
        bucketMap[bucket] += count;
      });
    }

    const levels: Array<{
      label: string;
      count: number;
      color: string;
      percent: number;
      ratio: number;
    }> = defaultLevels.map((score) => ({
      label: String(score),
      count: bucketMap[score] || 0,
      color: THEME_PRIMARY_COLOR,
      percent: 0,
      ratio: 0,
    }));

    const total = levels.reduce((s, l) => s + l.count, 0);
    const maxCount = Math.max(...levels.map((l) => l.count), 1);
    levels.forEach((l) => {
      l.percent = Math.max((l.count / maxCount) * 100, l.count > 0 ? 4 : 0);
      l.ratio = total > 0 ? Math.round((l.count / total) * 100) : 0;
    });
    return { levels, total };
  }, [distribution]);

  return (
    <View
      className={`${styles.scoreChart} ${compact ? styles.compact : ''}`}
    >
      {!compact ? <View className={styles.chartTitle}>评分分布</View> : null}
      {data.total === 0 ? (
        <View className={styles.empty}>
          <AppIcon
            name="rating"
            size="48rpx"
            className={styles.emptyIcon}
          />
          <Text className={styles.emptyText}>暂无评分数据</Text>
          {!compact ? (
            <Text className={styles.emptyHint}>做第一个评分的人吧～</Text>
          ) : null}
        </View>
      ) : (
        <View className={styles.chartBody}>
          {data.levels.map((l) => (
            <View
              key={l.label}
              className={`${styles.chartRow} ${l.count > 0 ? '' : styles.chartRowInactive}`}
            >
              <Text className={styles.chartLabel}>{l.label}分</Text>
              <View className={styles.chartProgress}>
                <Progress
                  percent={l.percent}
                  showText={false}
                  strokeWidth={compact ? '10' : '14'}
                  background={l.count > 0 ? l.color : '#C8CDD6'}
                  color={THEME_PRIMARY_COLOR}
                />
              </View>
              <View className={styles.chartMeta}>
                <Text className={styles.chartCount}>{l.count}</Text>
                <Text className={styles.chartRatio}>{l.ratio}%</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {data.total > 0 && !compact ? (
        <View className={styles.chartFooter}>
          <Text>共 {data.total} 人评分</Text>
        </View>
      ) : null}
    </View>
  );
};

export default ScoreChart;
