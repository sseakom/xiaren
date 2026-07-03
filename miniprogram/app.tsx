import { PropsWithChildren } from 'react';
import Taro, { useDidHide, useDidShow, useLaunch } from '@tarojs/taro';
import { AnimationDatasetService } from './services/animationDataset';
import { CloudService } from './services/cloud';
import { RequestCacheService } from './services/requestCache';
import { UserService } from './services/user';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('[App] launched');

    // 全局未捕获错误 + 未处理 Promise 拒绝，统一打日志
    // bootstrap 链路里 catch 之外的部分（如 Taro.login / 云函数调用的底层错误）会冒泡到这里
    Taro.onError((err) => {
      console.warn('[App] onError', err);
    });
    Taro.onUnhandledRejection((res) => {
      console.warn('[App] onUnhandledRejection', res?.reason);
    });

    // 初始化云开发
    CloudService.init();
    RequestCacheService.runScheduledCleanup('launch');
    RequestCacheService.startPeriodicCleanup();
    // 启动时预热动画全量快照；首页/搜索也会在首次访问时兜底等待
    void AnimationDatasetService.bootstrap();
    // 异步获取 openid 并拉取用户信息
    UserService.bootstrap();
  });

  useDidShow(() => {
    RequestCacheService.startPeriodicCleanup();
    RequestCacheService.runScheduledCleanup('show');
  });

  useDidHide(() => {
    // 小程序退后台时先主动扫一轮，再停止定时器，避免空转。
    RequestCacheService.cleanup('hide');
    RequestCacheService.stopPeriodicCleanup();
  });

  return children;
}

export default App;
