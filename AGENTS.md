# AGENTS.md

> 给 AI Agent（Cursor / Claude Code / Trae / Aider 等）的工作指南。
> 读完本文 + [README.md](README.md) 后再开始改代码。

---

## 0. 项目一句话

Taro 4 + React 18 + TypeScript 的**微信小程序**（appid `wx29eab22ac6c0cfe7`），配套**微信云开发**（云函数 + 云数据库）。核心是给 B 站沙雕动画打分。

**业务核心三件套**：贝叶斯平均分（WR）、模糊搜索、收藏/看过。

---

## 1. 必读项（开始任务前 30 秒）

| 项 | 路径 | 重点 |
|---|---|---|
| 入口文件 | `miniprogram/app.tsx` | 启动时 `CloudService.init()` + `UserService.bootstrap()` |
| 全局配置 | `miniprogram/app.config.ts` | 页面注册在这里加 |
| 路径别名 | `tsconfig.json` | `@/*` → `miniprogram/*` |
| 云开发封装 | `miniprogram/services/cloud.ts` | 所有 DB / 云函数都从这里走 |
| 业务服务 | `miniprogram/services/business.ts` | 动画/评分/收藏 的增删改查 |
| 用户服务 | `miniprogram/services/user.ts` | 登录、缓存、统计 |
| 类型定义 | `miniprogram/types/index.ts` | 业务实体 TS 类型 |
| 工具函数 | `miniprogram/utils/{fuzzy,util}.ts` | 模糊匹配 + 格式化 |
| 全局样式 | `miniprogram/styles/variables.scss` | 颜色/间距/字号变量 |
| 主题色 | `#FF6B35`（橙色） | navbar 主题色 |

---

## 2. 目录铁律

```
miniprogram/     ← 改前端代码
cloudfunctions/  ← 改云函数
config/          ← 改构建配置
```

**严禁**：
- ❌ 复活 `src/` 目录（已经迁移到 `miniprogram/`）
- ❌ 把前端代码放到 `cloudfunctions/`，或反过来
- ❌ 在 `pages/` 里直接 `Taro.cloud.database()`（必须走 `CloudService`）

---

## 3. 改业务代码的工作流

```
1. 读 README.md（项目结构 + 核心算法）
2. 读 services/business.ts 或 user.ts（看现有 API）
3. 改业务服务（不要在 page 里写业务）
4. 改 types/index.ts（如有新增字段）
5. 改 page / component
6. yarn build:weapp 验证
7. 上传云函数（如有改动）
```

---

## 4. 关键模式（必须遵守）

### 4.1 数据库操作

```ts
// ✅ 正确：走封装
const res = await CloudService.withTimeout(
  CloudService.db.collection('animations').doc(id).get({} as any),
  'animations.getById',
);

// ❌ 错误：直接用 Taro
const res = await Taro.cloud.database().collection('animations').get();
```

### 4.2 业务封装在 services，page 只调 API

```ts
// ✅ 正确：page 只调业务 API
const data = await AnimationService.list(page, pageSize);

// ❌ 错误：page 里写完整查询
const res = await CloudService.db.collection('animations').orderBy('publish_time', 'desc')...
```

### 4.3 类型与云开发集合同名

```ts
// 集合 animations → interface Animation
// 集合 ratings → interface Rating
// 集合 collections → interface Collection
// 集合 users → interface User
```

新增字段必须**同时**改 `types/index.ts` 和云开发数据库。

### 4.4 SCSS 走变量

```scss
// ✅
.button {
  background: $color-primary;
  padding: $spacing-md;
}

// ❌
.button {
  background: #FF6B35;
  padding: 16rpx;
}
```

### 4.5 错误处理

```ts
// ✅ 业务错误
try {
  await RatingService.submit(id, score);
} catch (err) {
  console.error('[Detail] 评分失败', err);
  Taro.showToast({ title: '评分失败', icon: 'none' });
}

// ❌ 静默吞错
try { ... } catch (e) {}
```

### 4.6 状态管理：只用 React Hooks

```ts
// ✅
const [list, setList] = useState<Animation[]>([]);

// ❌ 不要引入 Redux/Zustand（本项目刻意保持简单）
```

---

## 5. 修改清单（按文件类型）

### 5.1 加新页面

1. `miniprogram/pages/<name>/index.tsx` —— 页面组件
2. `miniprogram/pages/<name>/index.config.ts` —— `navigationBarTitleText`
3. `miniprogram/pages/<name>/index.module.scss` —— CSS Modules
4. `miniprogram/app.config.ts` —— `pages` 数组里加上 `pages/<name>/index`

### 5.2 加新组件

```
miniprogram/components/<Name>/
├── index.tsx          # 默认导出 React 组件
└── index.module.scss  # CSS Modules
```

使用：`import Comp from '@/components/<Name>'`

### 5.3 加新云函数

1. `cloudfunctions/<name>/index.js`
2. `cloudfunctions/<name>/package.json`（必须）
3. 微信开发者工具右键 → "上传并部署（不上传 node_modules）"
4. 客户端：`await CloudService.callFunction('<name>', data)`

### 5.4 加新业务服务

在 `services/business.ts` 加一个 `XxxService` 对象：

```ts
export const XxxService = {
  async list() { ... },
  async getById(id: string) { ... },
  async submit(data: any) { ... },
};
```

---

## 6. 云函数开发约定

### 6.1 入口模板

```js
// cloudfunctions/<name>/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    // 业务
    return { success: true, data };
  } catch (err) {
    console.error('[<name>] failed', err);
    return { success: false, error: err.message };
  }
};
```

### 6.2 用户主键

用户集合的 `_id` **必须**用 `cloud.getWXContext().OPENID`，这样自动 upsert 不冲突。

### 6.3 模糊搜索（仅 search 云函数）

`cloudfunctions/search/index.js` 的算法和 `miniprogram/utils/fuzzy.ts` **必须保持一致**（算法改一处改两处）。

---

## 7. 必跑验证

### 7.1 改前端代码后

```bash
yarn build:weapp
```

- 构建成功 ✅
- `dist/app.json` 的 `pages` 数组包含新页面
- TS 0 错误（用 IDE 看 Problems 面板）

### 7.2 改云函数后

1. 微信开发者工具 → 云开发 → 云函数 → 找到该函数 → **重新部署**
2. 在云开发控制台的"云函数测试"里调一次，看返回

### 7.3 改模糊匹配后

1. 客户端 `yarn build:weapp`
2. 云函数 `cloudfunctions/search/` 重新上传
3. 客户端搜索 + 调云函数测试，两边结果**应该一致**

### 7.4 改 types 后

```bash
yarn build:weapp  # TS 检查
```

新增字段**同时**改：
- `miniprogram/types/index.ts`（TS 类型）
- 云开发数据库（实际 schema）

---

## 8. 不要做的事（红线）

| 红线 | 原因 |
|---|---|
| ❌ 在 `pages/` 里直接 `Taro.cloud.database()` | 破坏 CloudService 的超时/日志/封装 |
| ❌ 在 SCSS 里硬编码 `#FF6B35` 等色值 | 应该用 `$color-primary` 变量 |
| ❌ 加全局 state（Redux/Zustand/Context） | 项目刻意保持纯 React Hooks |
| ❌ 复活 `src/` 目录 | 已迁移到 `miniprogram/`，所有 alias 都指向新位置 |
| ❌ 在 `services/business.ts` 里写 UI 代码 | services 是纯业务层 |
| ❌ 改模糊匹配算法只改一端 | 必须 client + 云函数**同步**改 |
| ❌ 用 `add()` 创建用户 | 必须用 `doc(openid).set()` upsert（避免主键冲突） |
| ❌ 删除云函数 `search` / `calcScore` / `phoneLogin` / `login` | 业务强依赖 |
| ❌ 给 `src/utils/fuzzy.ts` 改代码 | 路径错了，文件在 `miniprogram/utils/fuzzy.ts` |

---

## 9. 常见任务速查

| 用户说 | 改哪里 |
|---|---|
| "加一个新页面" | 见 §5.1 |
| "改主题色" | `miniprogram/styles/variables.scss` 的 `$color-primary` |
| "改首页样式" | `miniprogram/pages/index/index.module.scss` |
| "加一个云函数" | 见 §5.3 |
| "加一个业务 API" | `services/business.ts` 加一个 `XxxService` 对象 |
| "改评分算法" | `cloudfunctions/calcScore/index.js`（WR 公式） |
| "改模糊匹配" | `miniprogram/utils/fuzzy.ts` + `cloudfunctions/search/index.js`（同步） |
| "改登录流程" | `miniprogram/services/user.ts` + `cloudfunctions/login/phoneLogin/` |
| "加新字段" | types/index.ts + 云开发数据库 + 业务 services + UI |

---

## 10. 调试技巧

### 10.1 看云函数日志

微信开发者工具 → 云开发 → 云函数 → 选函数 → 日志

### 10.2 临时看请求

在 `CloudService.callFunction` 加 `console.log`，所有调用都带 `callId`（形如 `cf_l3x8h_a4f2`），可以关联客户端和云函数日志。

### 10.3 超时排查

如果某操作卡住，**8 秒后会**自动抛 `timeout` 错误（来自 `withTimeout`）。
看 `console.error` 里的 `[Cloud] <label> timeout after 8000ms`。

### 10.4 模拟器 vs 真机

- 模拟器：登录走"测试号"openid（每次启动变）
- 真机：openid 走用户自己的，且 `checkSession` 生效

---

## 11. 提 PR / 完成任务前自检

- [ ] 改了哪个模块？前端/云函数/两者都改？
- [ ] 改云函数后**重新上传**了？
- [ ] `yarn build:weapp` 通过？
- [ ] TS 0 错误？
- [ ] 没动 `src/`（目录已废）
- [ ] 没引入新的全局状态库
- [ ] 新加的字段在 `types/index.ts` 和云开发数据库**都有**
- [ ] 模糊匹配如果改了，**两边**都改了
- [ ] 业务错误都 `try/catch` 并 `showToast`
- [ ] 没硬编码 SCSS 色值
