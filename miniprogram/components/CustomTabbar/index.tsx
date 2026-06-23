import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';

export interface TabBarItem {
  /** 页面路径，相对于项目根目录，需带前导斜杠 */
  pagePath: string;
  /** 显示文字 */
  text: string;
  /** 未选中时图标（emoji 或文本） */
  icon?: string;
  /** 选中时图标（emoji 或文本） */
  iconActive?: string;
}

export interface CustomTabbarProps {
  /** 当前页面路径（用于高亮选中项），可不传，自动取当前页面 */
  currentPath?: string;
  /** tab 列表，不传则使用默认配置 */
  items?: TabBarItem[];
}

const DEFAULT_ITEMS: TabBarItem[] = [
  { pagePath: '/pages/index/index', text: '首页', icon: '🏠', iconActive: '🏠' },
  { pagePath: '/pages/search/index', text: '搜索', icon: '🔍', iconActive: '🔍' },
  { pagePath: '/pages/user/index', text: '我的', icon: '👤', iconActive: '👤' },
];

/**
 * Taro 自定义 TabBar（适用于微信/抖音/支付宝/百度小程序，以及 H5）
 * 替代 app.config 中的原生 tabBar，使 TabBar 样式与各端保持一致，
 * 同时支持 React 组件级别的灵活定制。
 */
const CustomTabbar: React.FC<CustomTabbarProps> = (props) => {
  const items = props.items || DEFAULT_ITEMS;
  const current = props.currentPath || Taro.getCurrentInstance().router?.path || '';

  const onSwitch = (item: TabBarItem) => {
    if (current === item.pagePath) return;
    // 非原生 tab 页之间跳转使用 redirectTo，避免页面栈堆积
    Taro.redirectTo({ url: item.pagePath });
  };

  return (
    <View className={styles.tabbar} role="tabbar">
      {items.map((item) => {
        const active = current === item.pagePath;
        return (
          <View
            key={item.pagePath}
            className={active ? `${styles.item} ${styles.itemActive}` : styles.item}
            onClick={() => onSwitch(item)}
            role="tab"
            aria-selected={active}
          >
            <Text className={styles.icon}>
              {active ? item.iconActive || item.icon : item.icon}
            </Text>
            <Text className={styles.text}>{item.text}</Text>
          </View>
        );
      })}
    </View>
  );
};

export default CustomTabbar;
