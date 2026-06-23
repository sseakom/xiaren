import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { CATEGORY_GROUPS } from '@/constants/categories';
import styles from './index.module.scss';

interface CategoryFilterProps {
  /** 当前选中的类别，空字符串表示「全部」 */
  value: string;
  /** 选中类别变化时触发，传 '' 表示清除筛选 */
  onChange: (category: string) => void;
}

/**
 * 分类筛选组件
 *  - 点击触发条展开/收起分组面板
 *  - 单选：选中某类别后自动收起；再次点击当前选中项可取消（回到「全部」）
 */
const CategoryFilter: React.FC<CategoryFilterProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  const handlePick = (cat: string) => {
    if (cat === value) {
      // 再次点击当前项 → 取消
      onChange('');
    } else {
      onChange(cat);
    }
    setOpen(false);
  };

  return (
    <View className={styles.wrap}>
      <View
        className={`${styles.trigger} ${value ? styles.triggerActive : ''} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Text className={styles.triggerIcon}>🏷️</Text>
        <Text className={styles.triggerLabel}>
          {value ? value : '分类'}
        </Text>
        <Text className={`${styles.triggerArrow} ${open ? styles.arrowUp : ''}`}>
          ▾
        </Text>
      </View>

      {open ? (
        <View className={styles.panel}>
          <ScrollView scrollY className={styles.scroll}>
            <View className={styles.group}>
              <View className={styles.groupTags}>
                <Text
                  className={`${styles.tag} ${!value ? styles.tagActive : ''}`}
                  onClick={() => handlePick('')}
                >
                  全部
                </Text>
              </View>
            </View>
            {CATEGORY_GROUPS.map((group) => (
              <View key={group.title} className={styles.group}>
                <Text className={styles.groupTitle}>{group.title}</Text>
                <View className={styles.groupTags}>
                  {group.items.map((cat) => (
                    <Text
                      key={cat}
                      className={`${styles.tag} ${value === cat ? styles.tagActive : ''}`}
                      onClick={() => handlePick(cat)}
                    >
                      {cat}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {open ? (
        <View className={styles.mask} onClick={() => setOpen(false)} />
      ) : null}
    </View>
  );
};

export default CategoryFilter;
