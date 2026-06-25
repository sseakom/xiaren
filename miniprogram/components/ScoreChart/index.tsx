import React, { useMemo } from 'react';
import { View, Text } from '@tarojs/components';
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
    if (!distribution || Object.keys(distribution).length === 0) {
      return { levels: [], total: 0 };
    }
    const scores = Object.keys(distribution).sort(
      (a, b) => parseFloat(b) - parseFloat(a),
    );
    const levels: Array<{
      label: string;
      count: number;
      color: string;
      idx: number;
      percent: number;
      ratio: number;
    }> = scores.map((s, idx) => ({
      label: s,
      count: distribution[s] || 0,
      // 5→10 分高对比，1→5 分低对比，色阶渐变
      color:
        parseFloat(s) >= 8
          ? THEME_PRIMARY_COLOR
          : parseFloat(s) >= 6
            ? '#F39C12'
            : parseFloat(s) >= 4
              ? '#95A5A6'
              : '#BDC3C7',
      idx,
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
      {data.levels.length === 0 ? (
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
            <View key={l.label} className={styles.chartRow}>
              <Text className={styles.chartLabel}>{l.label}分</Text>
              <View className={styles.chartBarBg}>
                <View
                  className={styles.chartBar}
                  style={{
                    width: `${l.percent}%`,
                    background: l.color,
                  }}
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
