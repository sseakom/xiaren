# AGENTS.md

> 给在本仓库工作的 AI Agent 的快速指南。
> 开始改代码前，先读 `README.md`，再看本文件。

---

## 0. 项目一句话

这是一个基于 **Taro 4 + React 18 + TypeScript + NutUI React** 的微信小程序，后端使用 **微信云开发**。

当前代码的核心特点不是“页面直连数据库”，而是：

- 前端只走 `services/*`
- 所有业务数据只走云函数
- 全栈业务主键统一为 `bvid`
- `CloudService` 已集成请求缓存、超时、日志和写后精准失效

---

## 1. 开始任务前先看哪里

| 模块 | 路径 | 你需要知道什么 |
|---|---|---|
| 启动入口 | `miniprogram/app.tsx` | `CloudService.init()`、`UserService.bootstrap()`、缓存清理调度 |
| 全局配置 | `miniprogram/app.config.ts` | 页面注册、原生 tabBar |
| 云函数调用层 | `miniprogram/services/cloud.ts` | 只有 `callFunction` / `callCloud` / `callCloudSafe`，无 DB 入口 |
| 业务服务层 | `miniprogram/services/business.ts` | 动画、评分、收藏、投稿、审核、B 站元信息拉取 |
| 用户服务 | `miniprogram/services/user.ts` | 静默登录、手机号登录、资料同步、统计 |
| 类型定义 | `miniprogram/types/index.ts` | `Animation` / `Submission` / `Rating` / `Collection` / `User` |
| 缓存适配 | `miniprogram/services/requestCache.ts` | Taro 存储封装 |
| 缓存核心 | `miniprogram/utils/requestCacheCore.ts` | TTL、LRU、Tag 精准失效 |
| 提交展示工具 | `miniprogram/utils/submission.ts` | 审核/提交页面共用展示逻辑 |
| 云函数目录 | `cloudfunctions/*` | 当前共有 13 个核心云函数 |

---

## 2. 当前真实架构

```text
page / component
    -> services/business.ts or services/user.ts
    -> services/cloud.ts
    -> cloudfunctions/*
    -> cloud database
```

### 硬约束

- ❌ 不要在页面里直接写 `Taro.cloud.database()`
- ❌ 不要在页面里直接写 `Taro.cloud.callFunction()` 处理业务数据
- ❌ 不要再使用 `_id` 作为业务跳转或关联主键
- ❌ 不要恢复自定义 tabbar 方案
- ❌ 不要写“全量清缓存”式失效逻辑来规避精确失效

### 必须遵守

- ✅ 页面只调 `services/*`
- ✅ 新增业务接口先补云函数，再补 service，再接页面
- ✅ 所有动画关联统一使用 `bvid` / `animation_bvid` / `target_bvid`
- ✅ 写操作后维护好缓存 Tag 失效
- ✅ 搜索算法改动必须前后端同步

---

## 3. 业务主键与数据模型

### 主键规则

- 动画业务主键：`bvid`
- 评分关联字段：`animation_bvid`
- 收藏关联字段：`animation_bvid`
- 提交目标字段：`target_bvid`
- 用户主键：`users._id = openid`

### 重要集合

| 集合 | 关键字段 |
|---|---|
| `animations` | `title` `bvid` `up_name` `cover` `duration` `play_count` `like_count` `tag` `publish_time` |
| `ratings` | `user_id` `animation_bvid` `score` |
| `collections` | `user_id` `animation_bvid` `type` |
| `users` | `nickName` `avatarUrl` `phoneNumber` `is_admin` |
| `submissions` | `type` `target_bvid` `payload` `status` `submitter_openid` |
| `config` | `key=global_avg_score` |

### 提交状态机

- `type`: `create` / `correction` / `correction_delete`
- `status`: `1` 已应用，`2` 审核中，`3` 驳回

注意：`my-submissions` 当前默认只看 `status in [2, 3]`，不是全量历史。

---

## 4. 云函数总览

| 云函数 | 作用 |
|---|---|
| `listAnimations` | 首页列表、排序、分类筛选 |
| `getAnimationById` | 按 `bvid` 读取详情 |
| `search` | 模糊搜索 |
| `rating` | 查询/提交评分、我的评分 |
| `collection` | 收藏/看过状态与列表 |
| `calcScore` | WR 综合评分 |
| `bilibiliFetch` | 拉取 B 站元信息 |
| `animationSubmit` | 录入、勘误、删除申请、取消提交、`bvid` 唯一性检查 |
| `animationMySubmissions` | 我的提交列表 |
| `animationReview` | 管理员审核列表、详情、审批 |
| `userService` | 用户档案、统计、管理员标记接口 |
| `login` | 获取 openid |
| `phoneLogin` | 手机号授权登录 |

如果你新增业务云函数，必须同步更新：

- `cloudfunctions/<name>/index.js`
- `cloudfunctions/<name>/package.json`
- `miniprogram/services/business.ts` 或 `miniprogram/services/user.ts`
- 相关文档说明

---

## 5. CloudService 与缓存

`miniprogram/services/cloud.ts` 是当前仓库最重要的基础设施之一。

### 它现在做了什么

- 统一调用云函数
- 统一超时和日志
- 读请求本地缓存
- 相同请求 in-flight 复用
- 按函数名和 payload 生成稳定 key
- 支持用户作用域缓存
- 写操作后按 Tag 精准失效

### 你改代码时要注意

- 新增读接口时，优先评估是否应该接入缓存策略
- 新增写接口时，必须评估应该失效哪些 Tag
- 缓存失败时要允许自动降级为真实请求，不能影响主流程
- 不要把“缓存命中”当成业务真实来源，写路径仍以云函数结果为准

### 相关文件

- `miniprogram/services/cloud.ts`
- `miniprogram/services/requestCache.ts`
- `miniprogram/utils/requestCacheCore.ts`
- `tests/request-cache.test.ts`

---

## 6. 常见改动应该怎么做

### 6.1 改页面 UI

1. 先找对应页面：`miniprogram/pages/<name>/index.tsx`
2. 看它依赖了哪些组件和 service
3. 优先复用已有组件，不要把业务逻辑写回页面
4. 样式放到同目录 `index.module.scss`

### 6.2 改业务接口

1. 先改云函数
2. 再改 `services/business.ts` 或 `services/user.ts`
3. 再改页面 / 组件调用
4. 如有字段新增，同步改 `miniprogram/types/index.ts`
5. 评估缓存读策略和写后失效 Tag

### 6.3 改投稿 / 审核链路

优先看这几处：

- `miniprogram/components/AnimationForm/index.tsx`
- `miniprogram/pages/animation-form/index.tsx`
- `cloudfunctions/animationSubmit/index.js`
- `cloudfunctions/animationMySubmissions/index.js`
- `cloudfunctions/animationReview/index.js`
- `miniprogram/utils/submission.ts`

### 6.4 改搜索逻辑

必须同时检查：

- `miniprogram/utils/fuzzy.ts`
- `cloudfunctions/search/index.js`
- `miniprogram/pages/search/index.tsx`

### 6.5 改评分 / 收藏 / 详情

优先看：

- `miniprogram/pages/detail/index.tsx`
- `miniprogram/components/RatingRow/index.tsx`
- `miniprogram/components/ScoreChart/index.tsx`
- `cloudfunctions/rating/index.js`
- `cloudfunctions/collection/index.js`
- `cloudfunctions/calcScore/index.js`

---

## 7. 视觉与交互约定

- 当前项目使用 **原生 tabBar**，不要再恢复 `CustomTabbar`
- 审核/提交列表已统一为“卡片主体 + 外部 `tagRow`”布局
- `AnimCard` 标题是单行横向滚动，不要改回多行截断
- 详情页评分区域采用卡片化双栏布局，尽量延续现有结构
- 分类筛选弹层支持点蒙层关闭，改动时注意不要引入遮挡问题
- NutUI React 组件只能按 React 用法接入，不要写 Vue 风格 `slot=\"icon\"`

---

## 8. 易错点

| 易错点 | 正确做法 |
|---|---|
| 在页面里直接查库 | 改成 service -> 云函数 |
| 新逻辑继续用 `_id` 跳转详情 | 改成传 `bvid` |
| 改搜索只改前端 | 前后端一起改 |
| 写完操作直接 `clearAll()` | 改成按 Tag 精准失效 |
| 新增用户字段只改前端类型 | 云函数写入逻辑和数据库结构一起改 |
| 误以为 `my-submissions` 是全量历史 | 当前默认仅审核中 / 驳回 |
| 文档还写自定义 tabbar / 直连 DB | 现在都不是 |

---

## 9. 验证清单

### 前端或 service 改动后

```bash
yarn build:weapp
```

### 缓存核心改动后

```bash
npx ts-node tests/request-cache.test.ts
```

### 云函数改动后

- 微信开发者工具重新部署对应云函数
- 至少手动验证一条主路径

---

## 10. 完成前自检

- [ ] 没有直接访问客户端 DB
- [ ] 没有把业务逻辑散落到页面里
- [ ] 没有重新引入 `_id` 作为业务主键
- [ ] 新字段已同步到类型、云函数和实际数据写入路径
- [ ] 搜索算法如有改动，前后端已同步
- [ ] 写操作的缓存失效 Tag 已补齐
- [ ] `yarn build:weapp` 通过
- [ ] 如改了云函数，已提醒重新部署
