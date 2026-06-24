export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/search/index',
    'pages/detail/index',
    'pages/user/index',
    'pages/my-ratings/index',
    'pages/my-collections/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FF6B35',
    navigationBarTitleText: '虾仁宇宙',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f5f5f5',
  },
  lazyCodeLoading: 'requiredComponents',
});
