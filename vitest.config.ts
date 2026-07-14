import { defineConfig } from 'vitest/config';
import path from 'path';

// 阶段 0 单测运行器配置（vitest）
// - environment: 'node'：阶段 0 仅覆盖纯函数与缓存标签生成，无需 jsdom
// - globals: true：启用 describe/it/expect/vi 全局（测试仍显式 import 以保可读）
// - include：tests/**/*.test.ts（含现有 request-cache.test.ts 的相对导入）
// - setupFiles：tests/setup.ts 将云函数顶层 require('wx-server-sdk') 重定向到
//   仓库内已提交的替身 tests/__mocks__/wx-server-sdk.js（node 环境无云端 SDK，且本仓库
//   registry 受限导致 wx-server-sdk 无法作为 devDependency 安装），保证单测可复现。
// - resolve.alias['@']：与 tsconfig 的 paths 一致，测试可 import '@/utils/xxx'。
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'miniprogram'),
    },
  },
});
