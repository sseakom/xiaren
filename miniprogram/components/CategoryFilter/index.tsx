import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Popup, Button } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/popup/style/style.css';
import '@nutui/nutui-react-taro/dist/es/packages/button/style/style.css';
import { CATEGORY_GROUPS } from '@/constants/categories';
import styles from './index.module.scss';

interface CategoryFilterProps {
  value: string;
  onChange: (category: string) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  const handlePick = (cat: string) => {
    onChange(cat === value ? '' : cat);
    setOpen(false);
  };

  return (
    <View className={styles.wrap}>
      <Button
        type={value ? 'primary' : 'default'}
        size="mini"
        shape="round"
        fill={value ? 'solid' : 'outline'}
        onClick={() => setOpen(true)}
      >
        🏷️ {value || '分类'}
      </Button>

      <Popup
        visible={open}
        position="right"
        closeable
        closeIconPosition="top-left"
        onClose={() => setOpen(false)}
        destroyOnClose
        style={{ width: '80vw' }}
      >
        <View className={styles.panel}>
          <View className={styles.panelHeader}>
            <Text className={styles.panelTitle}>选择分类</Text>
          </View>

          <ScrollView scrollY className={styles.scroll}>
            <View className={styles.group}>
              <View className={styles.groupTags}>
                <Button
                  type={!value ? 'primary' : 'default'}
                  size="mini"
                  shape="round"
                  fill={!value ? 'solid' : 'outline'}
                  onClick={() => handlePick('')}
                >
                  全部
                </Button>
              </View>
            </View>

            {CATEGORY_GROUPS.map((group) => (
              <View key={group.title} className={styles.group}>
                <Text className={styles.groupTitle}>{group.title}</Text>
                <View className={styles.groupTags}>
                  {group.items.map((cat) => (
                    <Button
                      key={cat}
                      type={value === cat ? 'primary' : 'default'}
                      size="mini"
                      shape="round"
                      fill={value === cat ? 'solid' : 'outline'}
                      onClick={() => handlePick(cat)}
                    >
                      {cat}
                    </Button>
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
