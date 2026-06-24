# 虾仁宇宙 · 沙雕动画评分

> B 站沙雕/搞笑动画的评分小程序。给搞笑动画打个分，看看哪部是"神作"，哪部是"全程高能"的烂活。

基于 **Taro 4 + React 18 + TypeScript** 的微信小程序，配套 **微信云开发**（云函数 + 云数据库）。

---

## ✨ 功能

| 模块 | 说明 |
|---|---|
| 🏠 首页 | 动画列表（按发布时间倒序），下拉刷新、触底加载、转发分享 |
| 📊 详情 | 0~5 星评分、**贝叶斯平均分（WR）**、评分分布、收藏 / 看过、**勘误**、跳转 B 站 |
| 🔍 搜索 | 热门词 + 历史词、**中文/英文模糊匹配**（容错字、容乱序） |
| 👤 我的 | 登录（手机号一键）、统计（评分/收藏数）、**录入动画**、**我的提交**、**审核中心（仅管理员）**、菜单、退出登录 |
| 📚 我的评分 | 列出我给所有动画打过的分 |
| ⭐ 我的收藏 | 列出我收藏 / 标记看过的动画 |
| 📝 录入动画 | 用户向社区贡献新动画（审核中 → 管理员通过后上线） |
| 🛡 审核中心 | 管理员审核待审 / 驳回记录，记录审核人和时间 |
| 📋 我的提交 | 用户查看自己的提交 / 勘误记录及审核结果 |

---

## 🛠 技术栈

| 类别 | 选型 |
|---|---|
| 跨端框架 | Taro 4.1.9（@tarojs/cli + @tarojs/react） |
| UI | React 18 + Sass + CSS Modules |
| 语言 | TypeScript 5（strictNullChecks on） |
| 状态 | React Hooks（无 Redux/Zustand） |
| 后端 | 微信云开发（云函数 + 云数据库） |
| 编译 | Webpack 5（自定义 `tsconfig-paths-webpack-plugin`） |

---

## 📁 目录结构

```
sha-diao-taro/
├── miniprogram/                # 小程序源码（前端）
│   ├── app.config.ts           # 全局页面注册 + 窗口配置
│   ├── app.tsx                 # 启动入口：初始化云开发 + 静默登录
│   ├── app.scss                # 全局样式（@use '@/styles/variables'）
│   ├── index.html              # H5 构建的 HTML 模板
│   ├── pages/                  # 页面（每个页面三件套 .tsx/.scss/.config.ts）
│   │   ├── index/              # 首页（列表）
│   │   ├── search/             # 搜索
│   │   ├── detail/             # 详情
│   │   ├── user/               # 我的
│   │   ├── my-ratings/         # 我的评分
│   │   ├── my-collections/     # 我的收藏
│   │   ├── animation-form/     # 录入 / 勘误表单
│   │   ├── my-submissions/     # 我的提交记录
│   │   ├── review-list/        # 审核列表（仅管理员）
│   │   └── review-detail/      # 审核详情（仅管理员）
│   ├── components/             # 复用组件
│   │   ├── StarRating/         # 星级评分
│   │   ├── ScoreChart/         # 评分分布图
│   │   ├── Skeleton/           # 骨架屏
│   │   ├── EmptyState/         # 空状态
│   │   ├── CategoryFilter/     # 类别筛选
│   │   ├── AnimationForm/      # 录入 / 勘误共用表单
│   │   └── CustomTabbar/       # 自定义底部 tabbar
│   ├── services/               # 业务层（与云开发解耦）
│   │   ├── cloud.ts            # CloudService：callFunction + 超时控制
│   │   ├── user.ts             # UserService：静默登录、用户档案、统计、isAdmin()
│   │   └── business.ts         # 业务服务：AnimationService / RatingService / CollectionService / ScoreService / SubmissionService / ReviewService
│   ├── types/                  # 全局 TS 类型
│   ├── utils/                  # 工具函数
│   │   ├── fuzzy.ts            # 模糊匹配算法
│   │   └── util.ts             # 数字/时间/时长格式化
│   ├── styles/                 # 全局 SCSS 变量/主题
│   └── data/                   # 离线 mock 数据
│
├── cloudfunctions/             # 云函数（后端）
│   ├── login/                  # wxLogin 换 openid
│   ├── phoneLogin/             # 手机号 cloudID 解密 + upsert 用户
│   ├── calcScore/              # 贝叶斯平均分 WR 计算
│   └── search/                 # 模糊搜索
│
├── config/                     # Taro 构建配置
│   ├── index.ts                # 主配置（sourceRoot、alias、postcss…）
│   ├── dev.ts
│   └── prod.ts
│
├── project.config.json         # 微信开发者工具项目配置（appid: wx29eab22ac6c0cfe7）
├── tsconfig.json               # 别名: @/* → miniprogram/*
├── tsconfig.check.json         # 仅做类型检查的配置
├── babel.config.js             # babel-preset-taro
└── package.json
```

### 别名约定

`tsconfig.json` 定义：

```json
"paths": { "@/*": ["miniprogram/*"] }
```

源代码里统一用 `@/types`、`@/services/business`、`@/components/StarRating` 等，避免深层相对路径。

---

## 🗄 云开发数据模型

### 数据库集合

| 集合 | 主键 | 用途 | 关键字段 |
|---|---|---|---|
| `animations` | `_id` | 动画信息 | `title` `bvid` `up_name` `cover` `duration` `play_count` `tag[]` `publish_time` |
| `ratings` | `_id` | 用户评分 | `user_id` `animation_id` `score` (0~5) `created_at` `updated_at` |
| `collections` | `_id` | 收藏/看过 | `user_id` `animation_id` `type` (`collect`/`watched`) `created_at` |
| `users` | `_id`(=openid) | 用户档案 | `openid` `nickName` `avatarUrl` `phoneNumber` `created_at` |
| `config` | `_id` | 配置 | `key` (如 `global_avg_score`) `value` |

### 索引建议

- `ratings`: `{ user_id, animation_id }` 联合唯一索引（同一用户对同一动画只能评一次）
- `collections`: `{ user_id, animation_id, type }` 联合唯一索引
- `animations`: `{ publish_time }` 倒序索引

---

## 🧠 核心算法

### 1. 贝叶斯平均分（WR）

参考 IMDB Top 250 算法，缓解"冷门动画靠 1 个 10 分刷上 9.8"的问题：

```
WR = (v / (v + m)) × R + (m / (v + m)) × C
R = 当前动画算术平均分
v = 当前动画评分人数
m = 最低评分阈值（默认 10）
C = 全局平均分（取自 config 集合的 global_avg_score）
```

由 `cloudfunctions/calcScore/index.js` 计算，详情页实时拉取。

### 2. 模糊搜索

`miniprogram/utils/fuzzy.ts` + `cloudfunctions/search/index.js`：

1. **DB 端**：用宽松 RegExp（`tok1|tok2|...`）拉候选集（上限 200 条）
2. **JS 端**：用 `fuzzyMatch` 再过滤一遍，去掉"碰巧命中但实际不相关"的噪声
3. **JS 端排序**：`fuzzyScore` 评分（`title` × 2 优先 > `up_name` > `tag`）

评分梯度：

| 命中规则 | 分数 |
|---|---|
| 完全相等 | 1000 |
| 前缀匹配 | 500 |
| 完整子串 | 200 |
| token 按序出现 | 100 |
| token 全出现（乱序也行） | 30 |
| 不匹配 | 0 |

支持容错（`沙diao` 也能命中 `沙雕`）、容乱序（`沙`+`diao` 也能命中 `沙雕`）、中英混排。

---

## 🚀 快速开始

### 前置

- Node.js ≥ 16
- 微信开发者工具
- 已开通云开发的环境（env: `cloud1-d0gk61vsuefecd8cf`）

### 安装 & 启动

```bash
yarn install

# 微信小程序：编译到 dist/
yarn dev:weapp

# H5
yarn dev:h5

# 生产构建
yarn build:weapp
```

编译完成后用微信开发者工具打开 `dist/` 目录即可预览。

### 上传云函数

微信开发者工具 → 右键 `cloudfunctions/login/` 等 → **"上传并部署（不上传 node_modules）"**

四个云函数都要传：

- `login`
- `phoneLogin`
- `calcScore`
- `search`

> 上面四个是基础版云函数；如果你启用了录入 / 审核 / 管理员功能，还需要上传：`userService` `listAnimations` `getAnimationById` `rating` `collection` `animationSubmit` `animationReview` `animationMySubmissions`。

## 🆕 录入 / 审核 / 勘误 流程

### 录入动画（用户）

1. 用户在《我的》点 **录入动画** → 跳转到 `pages/animation-form/index?mode=create`
2. 填写表单（标题 / bvid / UP 主 / 封面 / 时长 / 标签 / 发布日期 / 播放数 / 点赞数）
3. bvid 输入框 `onBlur` 时实时校验唯一性（action=checkBvidUnique）
4. 提交 → `SubmissionService.create(payload)` → 云函数 `animationSubmit` mode=create
5. 云函数校验：必填项、bvid 格式、bvid 唯一（与 status ∈ {1,2} 的记录冲突即拒）
6. 写入 `animations` 集合，`status=2`、`submitter_openid=openid`、`submitted_at=now`
7. 用户收到 `提交成功，等待审核` 提示，并可在《我的提交》查看进度

### 勘误（用户）

1. 在《视频详情》底部点 **勘误** → 跳转到 `pages/animation-form/index?mode=correction&correction_of={id}`
2. 表单组件 `AnimationForm` 接收 `initialValues`，回填所有字段（封面预览、时长、标签等）
3. 校验规则同录入（包含 bvid 唯一性，但允许 bvid 与原动画一致）
4. 提交 → `SubmissionService.correct(correctionOf, payload)` → 云函数 mode=correction
5. 云函数校验 `correction_of` 指向 `status=1` 的原记录，写入新记录并 `correction_of` 指向原 _id
6. 用户收到 `勘误已提交，等待审核` 提示

### 审核（管理员）

1. 管理员在《我的》点 **审核中心** → `pages/review-list/index`
2. 默认列出 `status=2` 的待审记录，可切换到「驳回 / 全部」
3. 点击记录 → `pages/review-detail/index?id={id}` 查看详情 + 提交人信息
4. 通过 / 驳回需填备注（驳回必填原因）→ `ReviewService.approve/reject`
5. 云函数 `animationReview` action=approve/reject：管理员鉴权 + 写 `status=1/3`、`reviewer_openid`、`review_time`、`review_comment`
6. 提交人可在《我的提交》即时看到最新状态和驳回原因

### 初始化管理员

首次使用没有管理员，需要先用云开发控制台手动把目标用户的 `is_admin` 设为 `true`：

```js
// 云开发控制台 → 数据库 → users → 找到目标用户 → 修改 is_admin: true
```

或者从云函数 `userService` 调 `setAdmin`（先有一个管理员）：

```js
await cloud.callFunction({
  name: 'userService',
  data: { action: 'setAdmin', target_openid: '...', is_admin: true },
});
```

### 修改云开发环境

`miniprogram/services/cloud.ts` 第 3 行：

```ts
const CLOUD_ENV = 'cloud1-d0gk61vsuefecd8cf';
```

---

## 🔐 登录流程

### 静默登录（启动时）

1. 取本地缓存的 openid（`user_openid_cache`）
2. `wx.checkSession` 校验微信会话是否有效
3. 有效 → 直接用缓存 openid 拉用户档案
4. 无效 → 走 `wx.login` → 云函数 `login` 换新 openid

### 手机号一键登录

1. 用户点"登录"按钮 → 触发 `<button open-type="getPhoneNumber">`
2. 拿到 `cloudID` → POST 云函数 `phoneLogin`
3. 云函数用 `cloud.getOpenData({ list: [{ cloudID }] })` 拿到明文手机号
4. `db.collection('users').doc(openid).set({...})` upsert 用户档案
5. 客户端 `UserService.userInfo` 同步更新

> `phoneLogin` 兼容 `cloudID` 优先、`encryptedData + iv` 兜底两种方式。

---

## ⏱ 超时控制

微信云开发 `db.get/set`、`callFunction` 偶尔会卡死（SDK 内部不返回）。

`CloudService.withTimeout(promise, label, 8000)` 包装一层 8 秒超时：

```ts
const res = await CloudService.withTimeout(
  CloudService.db.collection('animations').doc(id).get({} as any),
  'animations.getById',
);
```

`callFunction` 默认 30 秒，调用方可以临时覆盖：

```ts
await CloudService.callFunction('search', { keyword }, { timeoutMs: 15_000 });
```

---

## 📦 关键工具

| 函数 | 文件 | 用途 |
|---|---|---|
| `formatNumber(n)` | utils/util.ts | 1000→1k，10000→1w |
| `formatTime(date)` | utils/util.ts | 相对时间（"3 天前"） |
| `formatDuration(s)` | utils/util.ts | 秒 → `mm:ss` |
| `fuzzyMatch` / `fuzzyScore` / `fuzzyRank` | utils/fuzzy.ts | 模糊匹配核心 |
| `tokenize(s)` | utils/fuzzy.ts | 智能分词（ASCII 整词 / 中文按字） |
| `escapeRegExp(s)` | utils/fuzzy.ts | RegExp 特殊字符转义 |
| `scoreToText` / `scoreToColor` | utils/util.ts | 评分 → 文案/颜色映射 |

---

## 📝 开发约定

### 命名

- 页面：`pages/<name>/index.tsx` + `index.config.ts`（`navigationBarTitleText`） + `index.module.scss`
- 组件：`components/<Name>/index.tsx`（大驼峰目录，导出默认）
- 服务：`services/<domain>.ts`，导出 `XxxService` 对象
- 类型：集中放 `types/index.ts`，业务类型命名与云开发集合名一致（`Animation` `Rating` `Collection` `User`）

### 提交/UI

- 颜色变量统一在 `styles/variables.scss`，不要硬编码色值
- 间距/圆角/字号也走 SCSS 变量
- 任何修改 `data/` 都会触发 HMR（仅 dev 模式）

### 数据库操作

- **必须**走 `CloudService.db` 或 `services/business.ts` 的封装，不要在页面里直接 `Taro.cloud.database()`
- 大集合查询**必须**加分页
- 写操作**必须** catch 错误并 `Taro.showToast`

### 不要做的事

- ❌ 在 `pages/` 里直接 `Taro.cloud.database()`
- ❌ 在 SCSS 里硬编码颜色
- ❌ 加新的全局 `state`/`store`（项目刻意保持纯 React Hooks）
- ❌ 把 `src/` 目录复活（已经迁移到 `miniprogram/`）

---

## 🐛 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 详情页一直 loading | `db.doc(id).get()` 卡死 | 已被 `withTimeout` 覆盖，8s 后报错 |
| 搜索"沙雕"没结果 | 数据没进 animations 集合 | 在云开发控制台加测试数据 |
| 手机号登录拿到 `cloudID` 但解密失败 | 云函数 `phoneLogin` 没上传 | 重新上传该云函数 |
| 评分是 0 | `config` 集合没有 `global_avg_score` | 手动加一条 `{ key: 'global_avg_score', value: 3.5 }` |
| TS 报错"找不到名称 X" | alias 没生效 | 确认 `tsconfig.json` 里的 `paths` 是 `miniprogram/*` |
| 构建报 `@/...` 路径错误 | 构建缓存了旧 alias | `rm -rf dist && yarn build:weapp` |
| 提交时提示 "bvid 已存在" | 数据库里有同 bvid 的 status=1/2 记录 | 改 bvid（每个动画只能提交一次） |
| 《审核中心》入口不显示 | 当前用户不是管理员 | 在云开发控制台给该用户 `users.is_admin = true`（仅一次） |
| 驳回后用户看不到原因 | 通知功能未做 | 用户需主动打开《我的提交》查看 |
