import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Popup } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/popup/style/style.css';
import { CATEGORY_GROUPS } from '@/constants/categories';
import AppIcon from '@/components/AppIcon';
import styles from './index.module.scss';

interface CategoryFilterProps {
  value: string;
  onChange: (category: string) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const currentLabel = value || '全部分类';

  const handlePick = (cat: string) => {
    onChange(cat === value ? '' : cat);
    setOpen(false);
  };

  return (
    <View className={styles.wrap}>
      <View
        className={`${styles.currentBadge} ${styles.triggerBadge} ${value ? styles.triggerBadgeActive : ''}`}
        onClick={() => setOpen(true)}
      >
        <AppIcon name="list" size="22rpx" className={styles.currentBadgeIcon} />
        <Text className={styles.currentBadgeText}>{currentLabel}</Text>
      </View>

      <Popup
        visible={open}
        position="right"
        closeable
        onClose={() => setOpen(false)}
        onOverlayClick={() => setOpen(false)}
        destroyOnClose
        lockScroll={true}
        overlay={true}
        style={{ width: '90vw' }}
      >
        <View className={styles.panel}>

          <ScrollView scrollY className={styles.scroll}>
            <View className={styles.group}>
              <View className={styles.groupTags}>
                <View
                  className={`${styles.currentBadge} ${styles.tagBadge} ${!value ? styles.tagBadgeActive : ''}`}
                  onClick={() => handlePick('')}
                >
                  <AppIcon name="list" size="22rpx" className={styles.currentBadgeIcon} />
                  <Text className={styles.currentBadgeText}>全部</Text>
                </View>
              </View>
            </View>

            {CATEGORY_GROUPS.map((group) => (
              <View key={group.title} className={styles.group}>
                <Text className={styles.groupTitle}>{group.title}</Text>
                <View className={styles.groupTags}>
                  {group.items.map((cat) => (
                    <View
                      key={cat}
                      className={`${styles.currentBadge} ${styles.tagBadge} ${value === cat ? styles.tagBadgeActive : ''}`}
                      onClick={() => handlePick(cat)}
                    >
                      <AppIcon
                        name={value === cat ? 'watchedFilled' : 'list'}
                        size="22rpx"
                        className={styles.currentBadgeIcon}
                      />
                      <Text className={styles.currentBadgeText}>{cat}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Popup>
    </View>
  );
};

export default CategoryFilter;
