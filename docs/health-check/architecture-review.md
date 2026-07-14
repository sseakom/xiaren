# sha-diao-taro 架构 + 性能专项体检报告

> 体检人：高见远（架构师）
> 范围：`miniprogram/`（前端 + services + utils + 组件/页面）、`cloudfunctions/*`（14 个云函数）
> 方法：静态走读（Glob / Grep / Read），未运行、未改代码
> 结论先行：**未发现触碰硬约束的 P0 问题**；架构分层清晰、缓存与快照设计成熟；主要风险集中在「快照版本手动维护导致新内容上线延迟」「本地快照全量扫描的规模化隐患」「若干死代码/一致性细节」。

---

## 一、架构总评（分层 / 职责 / 硬约束）

### 1.1 分层与职责边界 —— 良好 ✅

```
page / component
   └─> services/business.ts | user.ts  （聚合、缓存策略、错误降级、本地快照）
          └─> CloudService（callFunction/callCloud/callCloudSafe：超时/日志/inflight 复用/读缓存/写后 Tag 失效）
                 └─> cloudfunctions/*  （DB 读写、鉴权、external HTTP）
                        └─> 云数据库 / 微信云存储 / B 站 API
```

- **页面/组件只调 services**：Grep `CloudService|callFunction|callCloud` 在 `pages/`、`components/`、`sub-pages/` 下**零命中**；Grep `Taro.cloud.database()` **零命中**。DB 入口只存在于云函数内（前端无 `db.collection`/`cloud.database`）。
- **service 与云函数职责清晰**：service 负责缓存策略、本地全量快照（`animationDataset`）、联表补齐（本地 `getMapByBvids`，**无 N+1 云调用**）、错误降级；云函数负责 DB、鉴权、外部 HTTP。职责无倒置。
- **service 层聚合合理**：`RatingService/CollectionService/...` 内部对结果做本地联表（`animationJoinAdapter`），避免前端逐条打云函数。

### 1.2 业务主键与跳转 —— 基本一致 ✅（1 处待确认）

- 动画统一用 `bvid`：详情跳转 `goDetail` 用 `?bvid=`，卡片 `key={item.bvid}`（`utils/nav.ts:13-20`、`pages/index/index.tsx:144`）。
- 评分/收藏用 `animation_bvid`，submission 用 `target_bvid`，用户 `_id=openid`（与 `AGENTS.md` 一致）。
- **唯一争议点**：`review-list → review-detail` 用 `?id=${item._id}` 跳转（`sub-pages/review-list/index.tsx:49`）。`submissions` 集合以 `_id` 为记录主键（无业务可读主键），动画跳转已统一 bvid，但审核流仍用 `_id`。是否违反「不再用 `_id` 作业务跳转主键」取决于约束是否覆盖 submissions（见第四部分 Q2）。`animation-form` 的 `onSuccess(_id)` 实参被页面忽略（只 `navigateBack`），未用于跳转，安全。

### 1.3 硬约束守门情况 —— 全部守住 ✅

| 硬约束 | 核查结果 |
|---|---|
| 页面禁止直连 DB / 直连 callFunction | ✅ 前端无任何 `cloud.database()`/`callFunction` 直连（仅 `user.ts` 内 `uploadFile`/`getTempFileURL` 走 services 层文件操作） |
| 不得用 `_id` 作业务主键（动画） | ✅ 动画全程 bvid；仅 submissions 审核流用 `_id`（见 1.2） |
| 不得恢复自定义 tabbar | ✅ `app.config.ts` 原生 tabBar |
| 不得写「全量清缓存」式失效 | ✅ Grep `clearAll`/`.clear(`/`removeStorage(cloud_request_cache` **零命中**；失效全部走 Tag 精准（`cloud.ts:204-309`） |
| 不得通过云函数设置 `users.is_admin` | ✅ `userService` 仅 `preserve` 既有 `is_admin`、不读客户端（`userService/index.js:24-44`）；`phoneLogin` 仅置 `false`（`:63`）；`animationReview` 仅 `读` 鉴权。无任何云函数可提升权限 |

**结论**：架构合规性好，分层与硬约束无一触碰红线，属「健康可维护」状态。

---

## 二、性能总评（缓存 / 首屏 / 云函数链路 / 渲染）

### 2.1 缓存策略 —— 接入一致、降级正确 ✅

- **读缓存覆盖全**：`listAnimations(snapshot 除外→never)`、`calcScore(3min)`、`bilibiliFetch(10min)`、`rating.get/listMy(60s,userScoped)`、`collection.getStatus/listMy(60s,userScoped)`、`userService.getInfo/loadStats`、`animationSubmit.checkBvidUnique(2min)`、`animationMySubmissions(60s,userScoped)`、`animationReview.list/get(60s)` —— 均有 TTL + 用户作用域 + 精准 Tag。
- **写后精准失效**：`buildInvalidationTags` 按业务语义失效 `user:ratings/stats/collections`、`animation:${bvid}:rating/collection/score`、`review:list/item`、`animations:list` 等，未使用全量清除。
- **降级正确**：`callCloudSafe` 失败返回 `null`（不抛），`isValidCacheableResult` 过滤 `success=false` 结果，**未把缓存命中当真源**（写路径始终走云函数）；`requestCacheCore` 全部 try/catch 兜底，缓存损坏不影响主流程。
- **inflight 复用**：相同读请求在飞行中复用 Promise（`cloud.ts:382-397`）。

### 2.2 首屏（动画快照同步）—— 设计合理，冷启动是主耗时点 ⚠️

- `App.useLaunch` 调用 `AnimationDatasetService.bootstrap()`：先读本地快照，**版本命中则瞬时可用**；仅版本变更/首次才拉全量（`animationDataset.ts:201-232`）。
- 首页 `ensureReady()` 会等待快照就绪，热启动无白屏。
- **主耗时点**：版本变更时的全量快照拉取（`fetchRemoteSnapshot` 60s 超时）。当前由 `fetchAllAnimations` 循环 `limit(100)` 拉取（云开发单次上限），数据 <500 时体积可控，但属于首屏唯一的「网络等待」来源。

### 2.3 云函数链路 —— 优化到位 ✅

- `calcScore` 用 `aggregate` 管道在 DB 端按 `score` 分组（≤11 条），**替代「全量拉万条评分再 JS 遍历」**（`calcScore/index.js:32-38`）。
- `bilibiliFetch` 视频信息 + tag **并行拉取**，tag 失败非阻塞，10s 超时 + `timeout` 事件销毁（`bilibiliFetch/index.js:24-92`）。
- `rating.submit` **异步触发** `calcScore`（不 await，不阻塞返回）（`rating/index.js:84-86`）。
- `userService.loadStats` 三个 count **并行**（`userService/index.js:126-130`）。
- `animationReview.joinSubmitters` 按 `_.in()` 分桶（BATCH 50）联表，**无 N+1**。

### 2.4 渲染 —— 长列表与分页已做基本防护 ✅

- `AnimCard` 用 `React.memo`（`:115`），避免列表重渲染。
- 首页/搜索的列表与搜索均走**本地快照内存分页**（`animationDataset.listPage/searchPage`），翻页不触发云调用；个人页联表走本地快照，**无云 N+1**。
- `usePagination` 用 ref 消除闭包陷阱、依赖变化回第 0 页（`hooks/usePagination.ts`）。

---

## 三、问题清单

| 编号 | 维度 | 严重度 | 位置 | 现象 | 影响 | 建议 |
|---|---|---|---|---|---|---|
| A1 | 快照/数据新鲜度 | **P1** | `cloudfunctions/animationsVersion/index.js:6`；`animationReview/index.js:120-225`；`cloud.ts:286-302` | 快照版本号是**硬编码常量**；`animationReview.approve` 落地 `animations` 后**无版本自增/推送**；CloudService 失效的 `animations:list` Tag 只针对「已不用的 `listAnimations` 读缓存」（前端走本地快照，不受其影响） | 管理员审核通过新动画/勘误后，前端**不会自动刷新快照**，用户看不到新内容，直至人工改 `animationsVersion` 并重新部署 | 在 `animationReview.approve` 成功后，自动 bump 版本（写入 `config` 集合或随结果返回新版本），前端 `bootstrap` 对比后拉新快照；或加「后台定时/启动轮询版本」降低手动依赖 |
| A2 | 死代码/分叉 | **P1** | `listAnimations/index.js:203-256`；`cloud.ts:314-318`；`animationDataset.ts:190` | 前端只用 `listAnimations` 的 `action:'snapshot'`；其 DB 端分页 + 慢速全量路径（`canUseDbPagination`/`fetchAllAnimations` 慢分支）**无任何调用方**；`cloud.ts` 对 listAnimations 非 snapshot 的 read 策略永不触发 | 维护分叉：云函数保留两条永不被前端使用的路径，易误改、占冷启动体积、与本地快照逻辑长期不一致 | 删除 `listAnimations` 的列表分页/慢速路径，仅保留 `snapshot`；或将前端列表切回服务端分页（仅当未来数据量超本地快照阈值时） |
| A3 | 性能/规模化 | **P2** | `animationDataset.ts:259-265, 280-295`；`pages/index/index.tsx:72-86` | `listPage`/`searchPage` 每次调用对**全量 `this.list`** 重新 `filter + sort`；搜索对每条记录做 3 次 `fuzzyScore`（title/up/tags）；首页 `useDidShow` 从详情返回触发 `load(0,true)` **重置首页并重算**，丢失滚动位置 | 当前数据 <500 可接受；数据增长后，每次翻页/切分类/搜索都在主线程全量扫描；返回首页重复全量计算 | 对快照建排序索引或缓存分页结果；搜索加 debounce 或移至 Worker；首页返回不强制 reload（记忆滚动位置/仅在必要时刷新） |
| A4 | 数据一致性 | **P2** | `cloudfunctions/calcScore/index.js:21-96`（无 db 写）；`animationDataset.ts:62-98`（score 来自快照）；`sub-pages/detail/index.tsx:86-104`（实时 calc） | `calcScore` 计算 WR 但**从不回写 `animations.score`**；首页卡片 `item.score`（来自快照）实质陈旧/缺失；详情页用实时 `ScoreService.calc` | 卡片与详情的「分数」来源割裂、不一致；快照 `score` 字段形同虚设 | 明确 `score` 语义：要么评级提交后由云函数聚合**回写** `animations.score` 并补失效 Tag，要么前端卡片统一改用实时 calc（权衡调用量）；至少在文档层面消除歧义 |
| A5 | 功能完整性 | **P2** | `animationReview/index.js:75`；`animationMySubmissions/index.js:32` | `review.list` `limit(100)`、`my-submissions` `limit(50)`，**无分页/无 total 返回** | 管理员待审、我的提交超过阈值被**静默截断**，前端无法翻页 | 加分页参数与 `total` 返回，前端 `ReviewService.list` / `listMySubmissions` 补分页 |
| A6 | 约束一致性 | **P2** | `sub-pages/review-list/index.tsx:49`；`sub-pages/review-detail/index.tsx:20` | 审核流用 `?id=${item._id}` 跳转（submissions 以 `_id` 为记录主键） | 字面违反「不再用 `_id` 作业务跳转主键」；但与动画 bvid 约束语境不同，属边界争议 | 团队确认约束是否覆盖 submissions；若要收敛，可给 submissions 增加业务可读主键，或 URL 用语义化 `submissionId` 参数（仍基于 `_id`，但命名与 bvid 区分） |
| A7 | 缓存实现瓶颈 | **P2** | `utils/requestCacheCore.ts:342-345, 359-375` | 单键 `cloud_request_cache_v1` 存整个 state；每次 `set`/`get` 都 `readState→writeState` **全量 JSON 序列化**整个缓存到 Taro storage；LRU 为溢出时按 `lastAccessedAt` 全排序删除 | 小程序同步 storage 上，条目多/单条大时**读写放大 O(N 序列化)**，可能拖慢读路径 | 监控缓存条目数与体积；命中率低或条目多时考虑分片存储 / 仅缓存高价值接口；评估独立键或异步落盘 |
| A8 | 首屏容错 | **P2** | `animationDataset.ts:194-198`；`pages/index/index.tsx` | 冷启动 `fetchRemoteSnapshot` 用 `callCloudSafe`，**失败返回 null 则保留空 list**，首页仅显示「暂无片源」空态，用户无感知是网络失败、也無重试入口 | 首屏无数据且无错误提示/重试，体验上「白/空屏」与「拉取失败」无法区分 | 区分「空数据」与「首屏拉取失败」：失败时显式错误态 + 重试按钮 |
| A9 | 渲染微优化 | **P3** | `components/AnimCard/index.tsx:63` | `parseTags(item.tags ?? item.tag)` 每卡片每渲染都 split；`types` 已预 split 为 `tags[]` 但未被优先使用 | 长列表（20+）重复字符串 split，微小但可消除 | 优先用 `item.tags`，或 `React.useMemo` 缓存解析结果 |
| A10 | 重复定义 | **P3** | `components/AnimationForm/index.tsx:252`；`cloudfunctions/animationSubmit/index.js:13` | BV 正则 `^BV1[A-Za-z0-9]{8,}$` 在前后端各定义一份 | 改一端易漏另一端，导致校验口径不一 | 抽到共享常量（前端 `constants/`、云函数共用 npm 包或拷贝同步） |
| A11 | 登录链路 | **P3** | `services/user.ts:170-188` | 首次登录 `fetchUserInfo` 先 `getInfo`，失败再 `upsert`，再失败兜底——多一次云往返 | 首登多一次延迟，可接受 | 合并为 upsert-or-get 单云函数调用 |

---

## 四、待确认事项（需用户/主理人拍板）

- **Q1（A1）**：`animationsVersion` 是否应**自动化**？当前手动常量，新动画上线依赖「人工改版本 + 重新部署 `animationsVersion` 云函数」。建议改为「审核通过后自动 bump」。
- **Q2（A6）**：`_id` 用作 **submissions 审核跳转主键**，是否违反硬约束？还是仅约束动画 bvid？请明确边界。
- **Q3（A4）**：`animations.score` 字段的**语义与刷新策略**由谁拍板——回写 / 实时 calc / 弃用？这决定卡片是否展示分数。
- **Q4（A2）**：是否**删除 `listAnimations` 的死代码分页路径**？保留有维护分叉风险。
- **Q5（A3/A7）**：**数据规模预期**？`animations` 未来会不会破千/万？决定本地快照 + 内存搜索是否要改服务端分页 / 索引 / 分片缓存。

---

### 附：本次体检未改动任何代码，仅静态走读。涉及文件清单
- 前端：`miniprogram/services/{cloud,business,user,animationDataset,requestCache,cloudListAdapter,animationJoinAdapter,serviceHelpers}.ts`、`miniprogram/utils/{requestCacheCore,fuzzy,submission,nav}.ts`、`miniprogram/hooks/usePagination.ts`、`miniprogram/pages/*`、`miniprogram/sub-pages/*`、`miniprogram/components/AnimCard`、`miniprogram/components/AnimationForm`、`miniprogram/app.tsx`
- 云函数：`listAnimations`、`animationsVersion`、`calcScore`、`rating`、`collection`、`animationSubmit`、`animationReview`、`animationMySubmissions`、`userService`、`bilibiliFetch`（及 `login`/`phoneLogin` 走读确认）
