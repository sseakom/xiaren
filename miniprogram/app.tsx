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
    Taro.onError((err) => {
      console.warn('[App] onError', err);
    });
    Taro.onUnhandledRejection((res) => {
      console.warn('[App] onUnhandledRejection', res?.reason);
    });

    // 初始化云开发（同步操作，放最前面）
    CloudService.init();

    // 异步获取 openid 并拉取用户信息（关键路径）
    UserService.bootstrap();

    // 非关键路径：延迟到首帧渲染后执行，减少冷启动 TTI
    const defer = (fn: () => void) => {
      if (typeof Taro.nextTick === 'function') {
        Taro.nextTick(fn);
      } else {
        setTimeout(fn, 50);
      }
    };
    defer(() => {
      // 缓存清理（异步，不阻塞首屏）
      RequestCacheService.runScheduledCleanup('launch');
      RequestCacheService.startPeriodicCleanup();
    });
    // 动画全量快照预热（后台拉取，首页/搜索会在首次访问时兜底等待）
    AnimationDatasetService.bootstrap();
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
