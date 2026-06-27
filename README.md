# 虾仁宇宙 · 沙雕动画评分

> 基于 **Taro 4 + React 18 + TypeScript + NutUI React** 的微信小程序，配套 **微信云开发**（云函数 + 云数据库）。
> 核心体验是给 B 站沙雕/搞笑动画打分、收藏、标记看过，并支持社区录入、勘误、删除申请与管理员审核。

---

## 功能概览

| 模块 | 当前实现 |
|---|---|
| 首页 | 动画列表、排序切换（最新 / 播放量 / 时长升降序）、分类筛选、触底加载 |
| 搜索 | 热门词 + 历史词、模糊搜索、分类筛选、分页加载 |
| 详情 | WR 综合评分、评分分布、我的评分、收藏 / 看过、标题 / bvid 复制、提交勘误 |
| 我的 | 静默登录、手机号授权登录、头像/昵称更新、评分/收藏/看过统计、菜单入口 |
| 我的评分 | 查看自己打过分的动画列表 |
| 我的收藏 | 查看 `collect` / `watched` 两类记录 |
| 录入动画 | 输入 `bvid` 或 B 站链接，自动拉取元信息，提交审核 |
| 勘误 / 删除申请 | 勘误仅修改标题和标签；删除申请需填写原因 |
| 我的提交 | 仅显示审核中 / 已驳回记录，支持取消审核中的提交 |
| 审核中心 | 管理员查看 submissions、审批通过 / 驳回、联表展示提交人和目标动画 |
| 请求缓存 | 云函数读请求支持 TTL、本地持久化、LRU 淘汰、按 Tag 精准失效 |

---

## 技术栈

| 类别 | 选型 |
|---|---|
| 跨端框架 | Taro 4.1.9 |
| UI | React 18 + NutUI React Taro + Sass + CSS Modules |
| 语言 | TypeScript 5 |
| 云开发 | 微信云开发（Cloud Functions + Cloud Database） |
| 业务层 | `services/business.ts` + `services/user.ts` |
| 云函数调用 | `services/cloud.ts` 统一封装 |
| 本地缓存 | `services/requestCache.ts` + `utils/requestCacheCore.ts` |
| 测试 | `tests/request-cache.test.ts` |

---

## 当前架构

```text
pages / components
        |
        v
services/business.ts / services/user.ts
        |
        v
services/cloud.ts
  - callFunction
  - callCloud
  - callCloudSafe
  - 本地请求缓存 / in-flight 复用 / 超时 / 日志
        |
        v
cloudfunctions/*
        |
        v
Cloud Database
```

### 关键约束

- 客户端 **禁止** 直接调用 `Taro.cloud.database()`。
- 所有业务读写都必须走 `CloudService` 和对应云函数。
- 全栈业务主键统一使用 `bvid`。
- 关联字段统一使用 `animation_bvid`、`target_bvid`。
- 写操作后必须走缓存 Tag 精准失效，不能依赖全量清缓存。

---

## 目录结构

```text
sha-diao-taro/
├── miniprogram/
│   ├── app.tsx                    # 启动入口：初始化云开发 + 用户启动链路 + 缓存清理调度
│   ├── app.config.ts              # 页面注册、原生 tabBar
│   ├── pages/
│   │   ├── index/                 # 首页
│   │   ├── search/                # 搜索
│   │   ├── detail/                # 详情
│   │   ├── user/                  # 我的
│   │   ├── my-ratings/            # 我的评分
│   │   ├── my-collections/        # 我的收藏 / 我看过的
│   │   ├── animation-form/        # 录入 / 勘误 / 删除申请
│   │   ├── my-submissions/        # 我的提交
│   │   ├── review-list/           # 审核列表
│   │   └── review-detail/         # 审核详情
│   ├── components/
│   │   ├── AnimCard/              # 列表卡片
│   │   ├── AnimationForm/         # 录入 / 勘误 / 删除申请表单
│   │   ├── CategoryFilter/        # 分类筛选弹层
│   │   ├── RatingRow/             # 我的评分交互行
│   │   ├── ScoreChart/            # 评分分布
│   │   ├── TagRow/                # 标签行
│   │   └── ...
│   ├── constants/
│   │   ├── categories.ts          # 分类筛选配置
│   │   └── theme.ts               # 主题色常量
│   ├── hooks/
│   │   └── usePagination.ts       # 首页分页逻辑
│   ├── services/
│   │   ├── cloud.ts               # 云函数调用 + 请求缓存 + 超时 + 日志
│   │   ├── business.ts            # Animation / Rating / Collection / Submission / Review / Bilibili 服务
│   │   ├── requestCache.ts        # Taro 存储适配层
│   │   └── user.ts                # 用户登录、资料、统计
│   ├── types/
│   │   └── index.ts               # 动画 / 提交 / 评分 / 收藏 / 用户类型
│   └── utils/
│       ├── fuzzy.ts               # 前端模糊匹配算法
│       ├── requestCacheCore.ts    # TTL + LRU + Tag 失效核心
│       ├── submission.ts          # 提交记录展示逻辑
│       └── util.ts                # 格式化工具
├── cloudfunctions/
│   ├── listAnimations/
│   ├── getAnimationById/
│   ├── search/
│   ├── rating/
│   ├── collection/
│   ├── calcScore/
│   ├── bilibiliFetch/
│   ├── animationSubmit/
│   ├── animationMySubmissions/
│   ├── animationReview/
│   ├── userService/
│   ├── login/
│   └── phoneLogin/
├── tests/
│   └── request-cache.test.ts
├── README.md
└── AGENTS.md
```

### 页面与 tabBar

当前使用 **原生 tabBar**，底部三个入口：

- `pages/index/index`
- `pages/search/index`
- `pages/user/index`

---

## 云函数清单

当前仓库包含 13 个核心云函数：

| 云函数 | 用途 |
|---|---|
| `listAnimations` | 首页列表、排序、分类筛选 |
| `getAnimationById` | 按 `bvid` 读取动画详情 |
| `search` | 模糊搜索 + 分类筛选 |
| `rating` | 查询 / 提交评分、我的评分列表 |
| `collection` | 收藏 / 看过状态与列表 |
| `calcScore` | 计算 WR 综合评分与评分分布 |
| `bilibiliFetch` | 通过 `bvid` / 链接拉取 B 站视频元信息 |
| `animationSubmit` | 录入、勘误、删除申请、`bvid` 唯一性检查、取消提交 |
| `animationMySubmissions` | 查询我的待审 / 驳回记录 |
| `animationReview` | 管理员审核列表、详情、通过、驳回 |
| `userService` | 用户档案、统计接口（无 `setAdmin` 接口） |
| `login` | `wx.login` 后获取 openid |
| `phoneLogin` | 手机号授权登录 + 建档 |

---

## 数据模型

### 集合设计

| 集合 | 主键 / 关联 | 说明 | 关键字段 |
|---|---|---|---|
| `animations` | `_id`（DB）+ `bvid`（业务主键） | 动画主表 | `title` `bvid` `url` `up_name` `cover` `duration` `play_count` `like_count` `tag` `publish_time` `update_time` |
| `ratings` | `_id` | 用户评分 | `user_id` `animation_bvid` `score` `created_at` `updated_at` |
| `collections` | `_id` | 收藏 / 看过 | `user_id` `animation_bvid` `type` `created_at` |
| `users` | `_id = openid` | 用户档案 | `nickName` `avatarUrl` `phoneNumber` `is_admin` `created_at` `updated_at` |
| `submissions` | `_id` | 用户投稿 / 勘误 / 删除申请 | `type` `target_bvid` `payload` `status` `submitter_openid` `submitted_at` `reviewer_openid` `review_time` `review_comment` |
| `config` | `_id` | 配置 | `key` `value`，当前评分逻辑读取 `global_avg_score` |

### 提交状态

- `type`: `create` | `correction` | `correction_delete`
- `status`: `1` 已应用，`2` 审核中，`3` 驳回

### 索引建议

- `animations`: `bvid` 唯一索引，`publish_time` 倒序索引
- `ratings`: `{ user_id, animation_bvid }` 联合唯一索引
- `collections`: `{ user_id, animation_bvid, type }` 联合唯一索引
- `submissions`: `{ type, status, submitted_at }` 组合索引

---

## 核心流程

### 1. 首页与搜索

- 首页通过 `listAnimations` 拉取数据，支持 `publish_time`、`play_count`、`duration_asc`、`duration_desc` 四种排序。
- `publish_time` / `play_count` 且无分类时走 DB 端分页；时长排序或分类筛选时走全量拉取后内存处理。
- 搜索通过 `search` 云函数完成，流程是「DB 端 RegExp 拉候选集 -> 服务端 fuzzyScore 打分排序 -> 分页返回」。
- 首页和搜索共用 `CategoryFilter`，按 `tag` 精确类别筛选。

### 2. 详情页

- 详情页并行拉取：动画详情、我的评分、收藏/看过状态、WR 综合评分。
- 用户评分通过 `rating.submit` 提交，云函数会异步触发 `calcScore`。
- 收藏与看过通过 `collection.toggle` 分别写入 `type='collect'` / `type='watched'`。
- 标题、原作名、UP 主、`bvid` 支持点击复制。

### 3. 录入动画

1. 在“我的”进入 `pages/animation-form/index?mode=create`
2. 输入 `bvid` 或 B 站链接
3. 前端调用 `BilibiliService.fetchByBvid()`，由云函数 `bilibiliFetch` 拉取元信息
4. 自动回填标题、封面、UP 主、时长、播放量、点赞、发布时间、官方 tags
5. 调 `animationSubmit.action=checkBvidUnique` 校验唯一性
6. 提交 `type=create` 到 `submissions`
7. 管理员审核通过后，由 `animationReview` 落地到 `animations`

### 4. 勘误与删除申请

- 勘误模式仅允许修改 `title` 和 `tag`。
- 删除申请需要 `reason`，提交类型为 `correction_delete`。
- 两种模式都通过 `target_bvid` 指向原动画。
- 审核通过后：
  - `correction` 会更新原动画标题和标签
  - `correction_delete` 会删除原动画

### 5. 我的提交与审核

- `animationMySubmissions` 当前默认只返回 `status in [2, 3]`，即审核中 / 已驳回。
- 审核中的记录支持调用 `animationSubmit.action=cancel` 主动取消。
- `animationReview` 会联表补充 `submitter` 和 `target` 摘要，供列表和详情页展示。

### 6. 登录与用户态

- `app.tsx` 启动时执行 `CloudService.init()` + `UserService.bootstrap()`。
- `silentLogin()` 会优先复用本地缓存的 openid，并通过 `checkSession` 校验会话有效性。
- 未命中缓存或会话失效时回退到 `wx.login -> cloudfunctions/login`。
- 手机号登录通过 `phoneLogin` 解密手机号并尝试建档。
- 用户中心支持头像上传到云存储、昵称更新、评分/收藏/看过统计。

---

## 请求缓存

`services/cloud.ts` 已集成本地请求缓存，不再只是一个简单的 `callFunction` 包装。

### 当前能力

- 读请求按函数名 + payload + 用户作用域生成稳定缓存 key
- 支持 TTL 过期
- 支持 LRU 淘汰
- 支持按业务 Tag 精准失效
- 支持同 key 的 in-flight 请求复用
- 缓存读写失败时自动降级为真实云函数调用
- 在 `app.tsx` 的 `launch/show/hide` 生命周期中做清理调度

### 已接入缓存策略的典型函数

- `listAnimations`
- `getAnimationById`
- `search`
- `calcScore`
- `bilibiliFetch`
- `rating.get / rating.listMy`
- `collection.getStatus / collection.listMy`
- `userService.getInfo / loadStats`
- `animationMySubmissions`
- `animationReview.list / get`

### 写后失效示例

- 评分提交：失效 `user:ratings`、`user:stats`、`animation:<bvid>:rating`、`animation:<bvid>:score`
- 收藏切换：失效用户收藏列表、看过列表、统计、详情态缓存
- 审核通过：按 `submission` 元信息精准失效列表、详情、搜索、用户提交等缓存

---

## 核心算法

### 1. WR 贝叶斯平均分

```text
WR = (v / (v + m)) * R + (m / (v + m)) * C
R = 当前动画算术平均分
v = 当前动画评分人数
m = 10
C = 全局平均分（config.global_avg_score，默认 3.5）
```

实现位置：`cloudfunctions/calcScore/index.js`

### 2. 模糊搜索

实现位置：

- 前端：`miniprogram/utils/fuzzy.ts`
- 云函数：`cloudfunctions/search/index.js`

评分梯度：

| 命中规则 | 分数 |
|---|---|
| 完全相等 | 1000 |
| 前缀匹配 | 500 |
| 完整子串 | 200 |
| token 按序出现 | 100 |
| token 全出现（任意顺序） | 30 |
| 不匹配 | 0 |

注意：算法改动必须前后端同步。

---

## 快速开始

### 前置条件

- Node.js >= 16
- 微信开发者工具
- 已开通云开发环境
- `miniprogram/services/cloud.ts` 中配置了正确的 `CLOUD_ENV`

### 安装与启动

```bash
yarn install

yarn dev:weapp
```

也可以直接使用 npm 脚本：

```bash
npm run dev:weapp
```

编译完成后，用微信开发者工具打开项目或 `dist/` 目录预览。

### 常用构建命令

```bash
yarn build:weapp
yarn dev:h5
yarn build:h5
```

---

## 云函数部署

微信开发者工具中按需上传并部署以下云函数：

```text
listAnimations
getAnimationById
search
rating
collection
calcScore
bilibiliFetch
animationSubmit
animationMySubmissions
animationReview
userService
login
phoneLogin
```

如果前端改了某个云函数对应的调用协议，记得同步重新部署该云函数。

---

## 开发约定

### 业务约束

- 所有页面只调用 `services/*`，不直接碰云函数或数据库细节
- 业务唯一标识只认 `bvid`
- 新增关联字段统一使用 `animation_bvid` / `target_bvid`
- `users` 集合写入前不要依赖客户端传 `_id`

### 前端约束

- 页面文件统一放在 `miniprogram/pages/*`
- 组件复用优先沉到 `miniprogram/components/*`
- 样式统一走 `miniprogram/styles/variables.scss`
- 当前项目使用原生 tabBar，不要再恢复自定义 tabbar 逻辑

### 云函数约束

- 云函数统一返回 `{ success, data?, error? }` 风格；`login` 例外，直接返回微信上下文
- 改搜索算法时必须同步更新 `miniprogram/utils/fuzzy.ts` 和 `cloudfunctions/search/index.js`
- 审核相关逻辑必须维护好返回元信息，避免前端缓存无法精准失效

---

## 验证

### 前端改动后

```bash
yarn build:weapp
```

### 缓存核心回归

```bash
npx ts-node tests/request-cache.test.ts
```

---

## 常见坑

| 现象 | 当前实现里的关键信息 |
|---|---|
| 页面想直接查库 | 不允许，必须走 `CloudService` -> 云函数 |
| 详情 / 评分 / 收藏状态不刷新 | 先检查写操作后的缓存 Tag 是否失效到位 |
| 新增字段前端有、后端没有 | 需要同时改 `types/index.ts`、云函数写入逻辑、数据库实际结构 |
| 搜索改了一端不生效 | `fuzzy.ts` 和 `search/index.js` 必须同步 |
| 我的提交看不到已通过记录 | 当前实现默认只返回审核中 / 已驳回 |
| 业务跳转还在传 `_id` | 当前实现统一按 `bvid` 跳转和查询 |

