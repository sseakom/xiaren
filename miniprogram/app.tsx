import React, { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import { CloudService } from './services/cloud';
import { UserService } from './services/user';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('[App] launched');
    // 初始化云开发
    CloudService.init();
    // 异步获取 openid 并拉取用户信息
    UserService.bootstrap();
  });

  return children;
}

export default App;
