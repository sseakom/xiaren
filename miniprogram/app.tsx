import { PropsWithChildren } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { CloudService } from './services/cloud';
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
    // 异步获取 openid 并拉取用户信息
    UserService.bootstrap();
  });

  return children;
}

export default App;
