import Module from 'node:module';
import path from 'node:path';

// 单测环境装配：将云函数顶层 require('wx-server-sdk') 重定向到仓库内已提交的替身
// tests/__mocks__/wx-server-sdk.js。原因：阶段 0 单测在 node 环境运行，无云端 SDK；
// 且本仓库 registry 受限（@nutui 传递依赖缺失）导致 wx-server-sdk 无法作为 devDependency
// 安装。该 hook 在 worker 进程内拦截原生 require，使云函数与测试共享同一替身实例
// （共享 setMockAnimations 注入的假数据），无需依赖 node_modules 状态，保证可复现。
const STUB_PATH = path.resolve(__dirname, '__mocks__/wx-server-sdk.js');

const originalLoad = Module._load as (
  request: string,
  parent: unknown,
  isMain: boolean,
) => unknown;

Module._load = function (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
): unknown {
  if (request === 'wx-server-sdk') {
    return originalLoad.call(this, STUB_PATH, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};
