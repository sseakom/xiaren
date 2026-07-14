# sha-diao-taro 全量健康体检 · 总报告

> 主理人：齐活林（交付总监）
> 团队：software-health-check（高见远·架构师 / 寇豆码·工程师）
> 范围：前端 `miniprogram/` + 云函数 `cloudfunctions/*`（14 个）
> 方法：静态走读（Glob / Grep / Read），未运行、未改任何代码
> 日期：2026-07-14

---

## 一句话结论（TL;DR）

**项目处于"健康可维护"状态：分层严格、硬约束全守住、无 P0 红线/安全/崩溃缺陷；主要风险集中在「快照版本手动维护导致新内容上线延迟」「类型门禁缺失 + 测试极薄」「listAnimations 死代码与跨边界复制」四类，建议按本报告四阶段路线图推进优化。**

---

## 一、健康度评分卡

| 维度 | 评级 | 结论 |
|---|---|---|
| 架构分层 | **A-** | 页面/组件只调 services，前端零 DB 直连、零 `callFunction` 直连；职责无倒置 |
| 硬约束守门 | **A** | 五项硬约束（不直连 DB、bvid 主键、不恢复自定义 tabBar、精准失效、不设 is_admin）全部守住 |
| 性能 | **B+** | 缓存接入一致、降级正确、云函数聚合/并行到位；首屏冷启动与本地快照规模化是隐患 |
| 代码质量 | **B+** | 关注点分离好、约定落地扎实；类型严格度弱 + 重复代码是短板 |
| 测试覆盖 | **C** | 全仓仅 1 个单测（`request-cache`），无测试运行器脚本 |
| 安全 | **A** | 无越权/提权口，`is_admin` 不可经任何云函数提升，鉴权齐备 |

**整体：无 P0 缺陷，可交付、可维护；优化优先级最高的四件事是「类型门禁 / 补单测 / 清死代码 / 快照版本自动化」。**

---

## 二、核心结论

### ✅ 做对的地方（应保留，勿在优化中破坏）
- 分层与缓存设计成熟：`CloudService` 读缓存 + 用户作用域 + 写后 Tag 精准失效，`callCloudSafe` 降级正确，未把缓存命中当真源。
- 云函数优化到位：`calcScore` 用 `aggregate` 管道、`bilibiliFetch` 并行拉取 + 超时销毁、`rating.submit` 异步触发 `calcScore`、`userService.loadStats` 并行 count、审核联表无 N+1。
- 渲染基本防护到位：`AnimCard` 用 `React.memo`，列表走本地快照内存分页，无云 N+1。
- 安全基线扎实：统一 `try/catch → {success,error}`、`validateCreatePayload` 入参校验、`requireAdmin` 齐备。

### ⚠️ 主要风险（按影响排序）
1. **P1 快照版本手动维护**：`animationsVersion` 为硬编码常量，审核通过新动画后前端不自动刷新，依赖人工改版本 + 重新部署。
2. **P1 类型门禁缺失**：`noImplicitAny:false` + `strict:false`，`build:weapp` 仅 babel 转译无 `tsc` 关卡，隐式 any 放行、类型债累积。
3. **P1 测试极薄**：核心业务逻辑（services/utils/12 云函数）无单测，改动无防护网。
4. **P1 listAnimations 死代码**：非 snapshot 分支（~100 行）前端永不调用，与本地快照逻辑长期分叉。
5. **P2 一致性/规模化**：score 写法割裂、审核/提交列表无分页、缓存单键全量序列化、首屏失败无错误态、跨边界常量/工具重复。

---

## 三、合并问题清单（去重后 23 项）

> 严重度：P0 阻断/安全/崩溃 · P1 重要（健壮/可维护/一致性） · P2 中等 · P3 轻微
> 来源：`A`=架构师报告，`C`=工程师报告

### P1（4 项 — 建议优先处理）

| 编号 | 维度 | 位置 | 现象 / 影响 | 建议 | 来源 |
|---|---|---|---|---|---|
| H-01 | 数据新鲜度 | `animationsVersion/index.js:6`；`animationReview/index.js:120-225`；`cloud.ts:286-302` | 版本号硬编码，审核通过后无自增/推送，新内容上线延迟至人工重新部署 | 审核通过自动 bump 版本（写 `config` 或随结果返回），前端对比后拉新快照 | A1 |
| H-02 | 类型/门禁 | `tsconfig.json:9`；`tsconfig.check.json:8`；`package.json:13` | `noImplicitAny:false`/`strict:false`，构建无 `tsc --noEmit` 关卡，类型错误不阻断发布 | 开 `strict`/至少 `noImplicitAny:true`，新增 `typecheck` 脚本并 CI/提交前卡点 | CQ-01 |
| H-03 | 测试覆盖 | `tests/`（仅 1 文件）；`package.json` | 核心业务逻辑无单测、无测试运行器 | 接入 vitest/jest，优先补 `fuzzy`/`util`/`submission`、云函数校验、`buildCacheTags/buildInvalidationTags` | CQ-02 |
| H-04 | 死代码 | `listAnimations/index.js:145-256`；`cloud.ts:314-318`；`animationDataset.ts:190` | 非 snapshot 分支不可达，与前端逻辑重复且分叉 | 确认无其它调用方后删除非 snapshot 分支，仅留快照读取 | A2 + CQ-03 |

### P2（14 项）

| 编号 | 维度 | 位置 | 现象 / 影响 | 建议 | 来源 |
|---|---|---|---|---|---|
| H-05 | 性能/规模化 | `animationDataset.ts:259-295`；`pages/index/index.tsx:72-86` | 每次翻页/搜索对全量 `list` 重算 `filter+sort`，返回首页强制 reload 丢失滚动 | 建排序索引/缓存分页结果；搜索加 debounce 或移 Worker；返回不强制 reload | A3 |
| H-06 | 数据一致性 | `calcScore/index.js:21-96`；`animationDataset.ts:62-98`；`detail/index.tsx:86-104` | `calcScore` 不回写 `animations.score`，卡片（快照）与详情（实时 calc）分数割裂 | 明确 score 语义：回写 + 补失效 Tag，或卡片统一实时 calc；先消歧义 | A4 |
| H-07 | 功能完整性 | `animationReview/index.js:75`；`animationMySubmissions/index.js:32` | 列表 `limit(100/50)` 写死、无分页/total，超阈值被静默截断 | 加分页参数 + 返回 total，前端补分页 | A5 + CQ-10 |
| H-08 | 一致性/主键 | `sub-pages/review-list/index.tsx:49` | 审核流用 `?id=${item._id}` 跳转，与"不用 `_id` 作业务主键"约定边界争议 | 确认约束是否覆盖 submissions；豁免或加显式 `reviewId` | A6 + CQ-09 |
| H-09 | 缓存实现 | `requestCacheCore.ts:342-375` | 单键存整个 state，每次 set/get 全量 JSON 序列化，LRU 全排序删除 | 监控条目数/体积；命中率低时考虑分片存储/仅缓存高价值接口 | A7 |
| H-10 | 首屏容错 | `animationDataset.ts:194-198`；`pages/index` | 冷启动快照拉取失败返回 null，仅显空态，无错误提示/重试 | 区分"空数据"与"拉取失败"，失败时显式错误态 + 重试 | A8 |
| H-11 | 一致性/魔法数 | `sub-pages/detail/index.tsx:224,272`；`calcScore/index.js:16` | 详情页 `v>=10` 硬编码，云函数有 `M_THRESHOLD=10` 未共享 | 前后端共享 `MIN_RATERS_FOR_WR` 常量 | CQ-04 |
| H-12 | 重复/跨边界 | `listAnimations/index.js:21-38`；`animationDataset.ts:38-55` | `toSafeNumber/normalizeTagList/parseDurationToSec` 前后端各一份 | 归一化工具单源化（`utils/normalize.ts`），加单测 | CQ-05 |
| H-13 | 重复定义 | `animationSubmit/index.js:13`；`bilibiliFetch/index.js:12`；`AnimationForm/index.tsx:252` | `BV_REGEX` 在 3 处重复 | 提取为共享常量（前端 `constants/` + 云函数引用） | A10 + CQ-06 |
| H-14 | 重复代码 | `pages/index/index.tsx:23-46`；`pages/search/index.tsx:23-47` | `SORT_TABS`/`TOGGLE_PAIRS`/`sortGroup` 两页几乎完全重复 | 抽共享 `components/SortTabs` 或 `hooks/useSortTabs` | CQ-07 |
| H-15 | 重复代码 | `AnimationForm/index.tsx:34-41`；`utils/util.ts:47-85` | `formatDurationText` 与 `util.formatDuration` 重复 | 删除 `formatDurationText`，统一 `util.formatDuration` | CQ-08 |
| H-16 | 类型收窄 | `review-detail/index.tsx:122,258`；`user/index.tsx:107,136,160` | 冗余 `(item as any).submitter`；微信事件 `e: any` | 去冗余断言；定义最小 `WechatButtonEvent` 类型 | CQ-11 |
| H-17 | 日志规范 | `cloud.ts`（约 12 处 console.log） | 每请求 debug 级日志随生产包上报，可能泄露请求体 | 引入日志级别开关（编译变量），生产仅 warn/error + 脱敏 | CQ-12 |
| H-18 | 类型/类型化 | `types/index.ts:62`；`submission.ts:35`；`review-detail:127` | `payload: Record<string,any>` 读字段无运行期校验 | 为 `payload` 按 type 提供类型化读取辅助，页面优先用 `disp.*` | CQ-15 |

### P3（5 项）

| 编号 | 维度 | 位置 | 现象 / 影响 | 建议 | 来源 |
|---|---|---|---|---|---|
| H-19 | 渲染微优 | `AnimCard/index.tsx:63` | `parseTags` 每卡片每渲染都 split | 优先用 `item.tags` 或 `useMemo` 缓存 | A9 |
| H-20 | 登录链路 | `user.ts:170-188` | 首登先 getInfo 失败再 upsert，多一次云往返 | 合并为 upsert-or-get 单云函数调用 | A11 |
| H-21 | 依赖 | `package.json:56` | `zustand` 依赖未使用 | 确认无计划使用后移除 | CQ-13 |
| H-22 | 组件体积 | `AnimationForm/index.tsx`(~738)；`review-detail/index.tsx`(~310) | 单文件承载多模式，认知负担高 | 按 mode 拆子组件（Create/Correction/Delete） | CQ-14 |
| H-23 | 健壮性 | 见 H-16/H-18 | 事件对象 any、payload 裸读 | 随 H-16/H-18 一并处理 | — |

---

## 四、优化路线图（四阶段，按性价比排序）

### 阶段 0 · 立即可做（低风险、高杠杆，建议本轮就落地）
1. **H-02 类型门禁**：开 `noImplicitAny`→`strict`，加 `typecheck` 脚本并 CI 卡点（先 noImplicitAny 后 strict，分批修）。
2. **H-03 补核心单测**：优先 `fuzzy`/`util`/`submission` + 云函数校验 + `buildCacheTags/buildInvalidationTags`。
3. **H-04 清死代码**：确认无调用方后删除 `listAnimations` 非 snapshot 分支。

### 阶段 1 · 需拍板（数据新鲜度 + 一致性）
4. **H-01 快照版本自动化**：审核通过自动 bump（先决 Q1）。
5. **H-06 score 语义**：回写 or 实时 or 弃用（先决 Q3）。
6. **H-07 列表分页**：review / 我的提交补分页 + total。
7. **H-08 审核主键**：确认 `_id` 跳转合规性（先决 Q2）。
8. **H-11 M_THRESHOLD 共享**：前后端共用阈值常量。

### 阶段 2 · 规模化 & 性能（数据增长后逐步做）
9. **H-05 本地快照索引 / 搜索 Worker / 返回不强制 reload**。
10. **H-09 缓存分片**（视条目数/体积）。
11. **H-10 首屏错误态 + 重试**。

### 阶段 3 · 去重 & 打磨
12. **H-12/H-13/H-14/H-15 共享常量与工具**（归一化、BV_REGEX、SortTabs、formatDuration）。
13. **H-16/H-17 类型收窄 + 日志级别开关/脱敏**。
14. **H-19/H-20/H-21/H-22 微优化**（AnimCard memo、登录合并、移除 zustand、组件拆分）。

---

## 五、待确认事项（需你拍板后我们再决定是否落地代码）

| 编号 | 关联 | 待确认问题 |
|---|---|---|
| Q1 | H-01 | `animationsVersion` 是否自动化（审核通过自动 bump）？还是维持手动 + 规范？ |
| Q2 | H-08 | `_id` 作 submissions 审核跳转主键是否违反硬约束？是否豁免/加 `reviewId`？ |
| Q3 | H-06 | `animations.score` 语义与刷新策略：回写 / 实时 calc / 弃用？决定是否在卡片展示分数 |
| Q4 | H-04 | 是否删除 `listAnimations` 死代码分页路径？（需确认无历史/未上线调用方） |
| Q5 | H-05/H-09 | 数据规模预期：`animations` 未来破千/万？决定本地快照/缓存是否改服务端分页/分片 |
| Q6 | H-02 | `build:weapp` 是否确实无 `tsc` 门禁（基于配置推断，建议二次确认 Taro 构建）？ |
| Q7 | H-03 | 测试框架选型（vitest / jest）？ |
| Q8 | H-11 | 详情页 `v>=10` 是否应与云函数 `M_THRESHOLD` 共享同一来源？ |
| Q9 | H-21 | `zustand` 是计划使用还是误引入？ |

---

## 六、子报告与原始产出
- 架构 + 性能专项：`docs/health-check/architecture-review.md`（高见远）
- 代码质量专项：`docs/health-check/code-quality-review.md`（寇豆码）

> 本次体检未改动任何代码。待你确认第五部分事项后，可启动标准 SOP 进入实现阶段。
