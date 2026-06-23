import { defineConfig, type UserConfigExport } from '@tarojs/cli';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import path from 'path';
import devConfig from './dev';
import prodConfig from './prod';
// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'shrimp-universe',
    date: '2025-12-10',
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'miniprogram',
    outputRoot: process.env.TARO_OUTPUT_DIR || 'dist',
    plugins: ['@tarojs/plugin-html'],
    defineConstants: {
      ENABLE_INNER_HTML: 'true',
      ENABLE_ADJACENT_HTML: 'false',
      ENABLE_SIZE_APIS: 'false',
      ENABLE_TEMPLATE_CONTENT: 'false',
      ENABLE_CLONE_NODE: 'false',
      ENABLE_CONTAINS: 'false',
      ENABLE_MUTATION_OBSERVER: 'false',
    },
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    cache: {
      // Webpack 5 持久化缓存：默认 false，开启后二次编译能显著提速
      // 缓存目录：node_modules/.cache/webpack/（已被 .gitignore 覆盖）
      // 模式：dev 和 prod 都走 filesystem
      enable: true,
      // Taro 默认 buildDependencies.config 指向 config/index（ts/js 都能解析到）
      // 这里加 dev/prod，保证 config 下任一文件改动时缓存失效
      buildDependencies: {
        config: [
          path.resolve(__dirname, 'index.ts'),
          path.resolve(__dirname, 'dev.ts'),
          path.resolve(__dirname, 'prod.ts'),
        ],
      },
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['nut-'],
          },
        },
        cssModules: {
          enable: true, // 开启 CSS Modules
          config: {
            namingPattern: 'module', // 仅 *.module.scss 生效
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
        chain.plugin('miniCssExtractPlugin').tap((args) => {
          args[0] = { ...(args[0] || {}), ignoreOrder: true };
          return args;
        });
        // 修复 Taro 4 硬编码的 buildDependencies.files = [src/app.config]
        // 源码根已迁到 miniprogram/，Taro 默认路径找不到会告警 + cache 命中失败
        // 用 toConfig 取出最终 config，直接覆盖 files，再 merge 回去
        // （绕开 chain.merge 默认的递归合并行为）
        const finalConfig = chain.toConfig();
        if ((finalConfig.cache as any)?.buildDependencies?.files) {
          (finalConfig.cache as any).buildDependencies.files = [
            path.resolve(__dirname, '..', 'miniprogram', 'app.config.ts'),
          ];
        }
        chain.merge({ cache: (finalConfig.cache as any) });
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js',
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: true, // 开启 CSS Modules
          config: {
            namingPattern: 'module', // 仅 *.module.scss 生效
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['body'],
            baseFontSize: 37.5,
            unitPrecision: 5,
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: true,
        },
      },
    },
  };
  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig);
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig);
});
