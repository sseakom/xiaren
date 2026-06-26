import Taro from '@tarojs/taro';

/** 跳转到动画详情页 */
export function goDetail(bvid: string) {
  if (!bvid) return;
  Taro.navigateTo({ url: `/pages/detail/index?bvid=${encodeURIComponent(bvid)}` });
}

/** 重启到首页（带 tabBar） */
export function goHome() {
  Taro.reLaunch({ url: '/pages/index/index' });
}

/** 跳转到搜索页 */
export function goSearch() {
  Taro.navigateTo({ url: '/pages/search/index' });
}
