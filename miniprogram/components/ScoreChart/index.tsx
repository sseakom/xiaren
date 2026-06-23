import React, { useMemo } from 'react';
import { View, Text } from '@tarojs/components';
import { ScoreDistribution } from '@/types';
import styles from './index.module.scss';

export interface ScoreChartProps {
  distribution: ScoreDistribution;
}

const COLORS = [
  '#E74C3C',
  '#FF6B35',
  '#F39C12',
  '#27AE60',
  '#3498DB',
  '#9B59B6',
  '#1ABC9C',
  '#E67E22',
  '#2ECC71',
  '#95A5A6',
];

const ScoreChart: React.FC<ScoreChartProps> = ({ distribution }) => {
  const data = useMemo(() => {
    if (!distribution || Object.keys(distribution).length === 0) {
      return { levels: [], total: 0 };
    }
    const scores = Object.keys(distribution).sort(
      (a, b) => parseFloat(b) - parseFloat(a),
    );
    const levels = scores.map((s, idx) => ({
      label: s,
      count: distribution[s] || 0,
      color: COLORS[idx % COLORS.length],
    }));
    const total = levels.reduce((s, l) => s + l.count, 0);
    const maxCount = Math.max(...levels.map((l) => l.count), 1);
    levels.forEach((l) => {
      l.percent = Math.max((l.count / maxCount) * 100, 2);
    });
    return { levels, total };
  }, [distribution]);

  return (
    <View className={styles.scoreChart}>
      <View className={styles.chartTitle}>评分分布</View>
      {data.levels.length === 0 ? (
        <View className={styles.empty}>暂无评分数据</View>
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
              <Text className={styles.chartCount}>{l.count}</Text>
            </View>
          ))}
        </View>
      )}
      {data.total > 0 ? (
        <View className={styles.chartFooter}>
          <Text>共 {data.total} 人评分</Text>
        </View>
      ) : null}
    </View>
  );
};

export default ScoreChart;
