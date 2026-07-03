import { THEME_PRIMARY_COLOR } from '@/constants/theme';

export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/search/index',
    'pages/user/index',
  ],
  subPackages: [
    {
      root: 'sub-pages/detail',
      pages: ['index'],
    },
    {
      root: 'sub-pages/my-ratings',
      pages: ['index'],
    },
    {
      root: 'sub-pages/my-collections',
      pages: ['index'],
    },
    {
      root: 'sub-pages/animation-form',
      pages: ['index'],
    },
    {
      root: 'sub-pages/my-submissions',
      pages: ['index'],
    },
    {
      root: 'sub-pages/review-list',
      pages: ['index'],
    },
    {
      root: 'sub-pages/review-detail',
      pages: ['index'],
    },
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: THEME_PRIMARY_COLOR,
    navigationBarTitleText: '虾仁宇宙',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f5f5f5',
    // 微信小程序启动时优先展示上一次渲染的静态骨架，加快白屏→首屏过渡
    initialRenderingCache: 'static',
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
