import { THEME_PRIMARY_COLOR } from '@/constants/theme';

export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/search/index',
    'pages/detail/index',
    'pages/user/index',
    'pages/my-ratings/index',
    'pages/my-collections/index',
    'pages/animation-form/index',
    'pages/my-submissions/index',
    'pages/review-list/index',
    'pages/review-detail/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: THEME_PRIMARY_COLOR,
    navigationBarTitleText: '虾仁宇宙',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f5f5f5',
  },
  tabBar: {
    color: '#999999',
    selectedColor: THEME_PRIMARY_COLOR,
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-active.png',
      },
      {
        pagePath: 'pages/search/index',
        text: '搜索',
        iconPath: 'assets/tabbar/search.png',
        selectedIconPath: 'assets/tabbar/search-active.png',
      },
      {
        pagePath: 'pages/user/index',
        text: '我的',
        iconPath: 'assets/tabbar/user.png',
        selectedIconPath: 'assets/tabbar/user-active.png',
      },
    ],
  },
  lazyCodeLoading: 'requiredComponents',
});
