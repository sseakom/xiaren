# 代码质量与可维护性体检报告

> 项目：sha-diao-taro（虾仁世界）微信小程序
> 范围：`miniprogram/`（Taro4 + React18 + TS + NutUI）与 `cloudfunctions/`（微信云开发）
> 评审角色：工程师（代码质量 / 可维护性专项）
> 方式：静态阅读（Glob / Grep / Read），不改代码

---

## 一、代码质量总评（定性结论）

**总体评价：B+（结构清晰、约定执行到位，但"严格性"与"测试/去重"存在明显短板）**

仓库整体质量在同类小程序中属于中上水平，主要体现在：

- **架构约定落地扎实**：页面 → `services/*` → `CloudService` → 云函数的分层严格贯彻，`AGENTS.md` 的硬约束（不直接查库、bvid 业务主键、写后按 Tag 精准失效）基本被遵守。
- **关注点分离良好**：`utils/submission.ts` 把三处提交页重复的 `TYPE_LABEL/TYPE_COLOR/字段提取` 抽到一处；`hooks/usePagination.ts` 收敛了 4 个列表页的分页样板；`utils/error.ts` 统一了 `console.error + showToast`；缓存层（`cloud.ts` + `requestCache.ts` + `requestCacheCore.ts`）设计完整、容错到位（存储异常自动降级）。
- **云函数健壮性与安全性达标**：统一 `try/catch → {success,error}` 返回、入参校验（如 `validateCreatePayload`）、`is_admin` 在 `userService` 被显式过滤（无 setAdmin 提权口）、`requireAdmin` 鉴权齐备。
- **类型与默认处理**：`tsconfig.json` 开启了 `noUnusedLocals/noUnusedParameters/strictNullChecks`，代码里对空值/异常普遍做了降级（callCloudSafe 失败返回 null、缓存读取失败回退真实请求）。

**主要短板（决定可维护性的风险点）：**

1. **类型严格度配置偏弱，且构建无类型门禁**：`noImplicitAny:false`、`tsconfig.check.json` 中 `strict:false`，而 `build:weapp` 仅走 babel 转译、没有 `tsc --noEmit` 关卡，也没有 `typecheck` 脚本。这导致隐式 `any` 被放行、类型错误不会阻断发布——是可维护性的"根因级"隐患。
2. **测试覆盖极薄**：`tests/` 仅有 `request-cache.test.ts` 一个文件，且 `package.json` 无 `test` 脚本；纯函数（`fuzzy/util/submission`）、缓存 Tag 策略、以及全部 12 个云函数的校验逻辑均处于"无单测"状态。
3. **存在不可达的重复代码与跨边界重复**：`listAnimations` 的非 snapshot 分支（前端早已不再调用）仍保留约 100 行与前端 `AnimationDatasetService` 重复的排序/过滤逻辑；`toSafeNumber/normalizeTagList`、`BV_REGEX`、排序 Tab 配置、时长格式化等在不同文件/运行时被复制多份。
4. **一致性细节**：详情页把贝叶斯阈值 `10` 硬编码（云端有命名常量 `M_THRESHOLD` 却未共享）；审核列表用 `submissions._id` 做跳转（与"不用 `_id` 作业务主键"约定存在偏差，因 submissions 无 bvid 尚可接受，但需确认）。

> 未发现阻断发布的 P0 级缺陷（无安全越权、无必崩路径）。以下问题按影响排序，建议作为下一轮重构 backlog。

---

## 二、问题清单

> 严重度：P0 阻断/安全/崩溃；P1 重要（健壮性·可维护性·一致性隐患，建议尽快）；P2 中等；P3 轻微。

| 编号 | 类别 | 严重度 | 位置(文件:行) | 现象 | 影响 | 建议 |
|---|---|---|---|---|---|---|
| CQ-01 | 类型/健壮性 | **P1** | `tsconfig.json:9`；`tsconfig.check.json:8`；`package.json:13` | `noImplicitAny:false`、check 配置 `strict:false`；`build:weapp` 仅 babel 转译，无 `tsc --noEmit` 门禁，也无 `typecheck` 脚本 | 隐式 `any` 被放行，类型错误不阻断发布，长期累积类型债 | 开启 `strict`（或至少 `noImplicitAny:true`），新增 `typecheck` 脚本并在 CI/提交前执行；分文件逐步修 `@ts-expect-error` |
| CQ-02 | 测试覆盖 | **P1** | `tests/`（仅 `request-cache.test.ts`）；`package.json:12-31` | 全仓唯一测试只覆盖 `requestCacheCore`；`services/*`、`utils/*`、`cloud.ts` 缓存 Tag 策略、12 个云函数均无单测，且无测试运行器脚本 | 核心业务逻辑改动无防护网，易被静默改坏 | 接入 vitest/jest；优先补纯函数（`fuzzy`、`util`、`submission`）、云函数校验（`animationSubmit`/`calcScore`/`userService`）、`buildCacheTags/buildInvalidationTags` |
| CQ-03 | 坏味道/死代码 | **P1** | `cloudfunctions/listAnimations/index.js:145-256` | 非 `snapshot` 分支（`canUseDbPagination`/`DB_SORT_CONFIG`/慢速全量路径）当前前端只以 `action:'snapshot'` 调用（`animationDataset.ts:190-191`），该路径不可达 | 约 100 行与前端 `AnimationDatasetService` 本地排序/过滤逻辑重复，两端逻辑分叉风险高、维护成本高 | 确认无其他调用方后删除非 snapshot 分支，仅保留快照读取；如需服务端分页，应作为独立、被调用到的能力 |
| CQ-04 | 一致性/魔法数字 | **P2** | `sub-pages/detail/index.tsx:224,272`；`cloudfunctions/calcScore/index.js:16` | 详情页 `v<10`/`v>=10` 硬编码阈值 10（注释写"M_THRESHOLD"但未引用）；云函数有命名常量 `M_THRESHOLD=10` | 两端阈值若不一致，会令"详情页是否展示综合评分"与"后端贝叶斯加权"语义错位，且易改一处漏一处 | 把阈值提取为前后端共享常量（如 `constants/score.ts` 导出一个 `MIN_RATERS_FOR_WR`，前端引用、云函数 import 同一份或同步注释） |
| CQ-05 | 重复代码/跨边界 | **P2** | `cloudfunctions/listAnimations/index.js:21-38`；`miniprogram/services/animationDataset.ts:38-55` | `toSafeNumber/normalizeString/normalizeTagList` 在云函数与前端各写一份；`parseDurationToSec`(listAnimations:72) 与 `util.formatDuration` 互为逆运算但逻辑分散 | 字段归一化规则改一处需同步两处，容易漂移 | 把归一化工具收敛为单一来源（可放 `utils/normalize.ts`，云函数侧复用或对齐实现），并加单测 |
| CQ-06 | 重复代码 | **P2** | `cloudfunctions/animationSubmit/index.js:13`；`cloudfunctions/bilibiliFetch/index.js:12`；`components/AnimationForm/index.tsx:252` | `BV_REGEX = /^BV1[A-Za-z0-9]{8,}$/` 在 3 处重复 | bvid 格式规则变更需改 3 处 | 提取为共享常量（前端 `constants/` + 云函数侧各引用），或云函数间抽公共模块 |
| CQ-07 | 重复代码 | **P2** | `pages/index/index.tsx:23-46`；`pages/search/index.tsx:23-47` | `SORT_TABS`/`TOGGLE_PAIRS`/`sortGroup` 首页与搜索页几乎完全重复 | 排序交互改一处需同步两页，易遗漏 | 抽为共享 `components/SortTabs` 或 `hooks/useSortTabs`（含 `sortGroup`/`TOGGLE_PAIRS` 配置） |
| CQ-08 | 重复代码 | **P2** | `components/AnimationForm/index.tsx:34-41`；`utils/util.ts:47-85` | `formatDurationText`（秒→`m:ss`/`h:mm:ss`）与 `util.formatDuration` 重复同一格式化逻辑 | 时长展示规则两处实现，可能表现不一致 | 删除 `formatDurationText`，统一用 `util.formatDuration`（空值返回 `''` 的语义由调用处处理） |
| CQ-09 | 一致性/主键 | **P2** | `sub-pages/review-list/index.tsx:49` | 用 `item._id` 拼 `review-detail?id=...` 跳转，与 `AGENTS.md`"不用 `_id` 作业务跳转主键"约定存在偏差 | submissions 无 bvid 业务键，属"可接受但需确认"；若未来引入 reviewId 需统一 | 确认是否给 submissions/reviews 增加显式 `reviewId` 业务键并改用之；否则在 AGENTS.md 显式标注"审核类内部跳转允许用 `_id`" |
| CQ-10 | 健壮性/边界 | **P2** | `cloudfunctions/animationMySubmissions/index.js:32` | `limit(50)` 写死，无分页参数 | 用户提交 >50 条时，前端"我的提交"只展示前 50（且该页默认只看 status 2/3） | 支持 `limit/offset` 入参（对齐其它 list 云函数），或至少在 AGENTS/注释中标注 50 条上限 |
| CQ-11 | 可维护性/类型 | **P2** | `sub-pages/review-detail/index.tsx:122,258`；`pages/user/index.tsx:107,136,160` | `(item as any).submitter`（submitter 已类型化，断言冗余）；`onGetPhoneNumber/onChooseAvatar/onNicknameBlur` 形参 `e: any` | 冗余断言掩盖真实类型；事件对象 `any` 失去类型保护 | 去掉多余 `as any`；为微信事件回调定义最小 `WechatButtonEvent` 类型（含 `detail`） |
| CQ-12 | 日志规范 | **P2** | `miniprogram/services/cloud.ts:388,393,426,471,485,487,497` 等（约 12 处） | 每个云函数请求都 `console.log`（▶ 开始 / ✓ 成功 / ♻ 失效），属 debug 级日志随生产包上报 | 生产环境日志噪音大、可能泄露请求体（`console.log(... data)`） | 引入日志级别开关（如 `process.env.NODE_ENV`/编译变量），生产仅保留 warn/error；敏感 payload 不落日志 |
| CQ-13 | 依赖 | **P3** | `package.json:56` | 依赖 `zustand` 但全仓未使用（状态走 `UserService` 单例 + React state） | 无用依赖，增加安装体积与审计面 | 确认无计划使用后删除该依赖 |
| CQ-14 | 组件体积 | **P3** | `components/AnimationForm/index.tsx`（~738 行）；`sub-pages/review-detail/index.tsx`（~310 行） | 单文件承载三种模式/三种提交类型的渲染，认知负担偏高 | 不利于多人并行维护与回归定位 | 把 `mode` 专属渲染拆为子组件/独立文件（如 `AnimationFormCreate`/`Correction`/`Delete`），主组件只做分发 |
| CQ-15 | 健壮性/类型收窄 | **P3** | `types/index.ts:62`；`utils/submission.ts:35`；`sub-pages/review-detail/index.tsx:127` | `Submission.payload: Record<string,any>`、`SubmissionDisplay.publishTime?: any`；`review-detail` 直接读 `payload.title/payload.reason` 等字段无运行期校验 | 业务多态可接受，但读字段时缺轻量校验，字段缺失会渲染 `undefined` | 建议为 `payload` 按 type 提供类型化读取辅助（或 `getSubmissionDisplay` 已覆盖常用字段，页面优先用 `disp.*` 而非裸 `payload.*`） |

---

## 三、重构优先级建议（按性价比排序）

1. **【最高杠杆】收紧类型 + 接入类型门禁（CQ-01）**
   开启 `strict`/`noImplicitAny`，新增 `typecheck` 脚本并在 CI 与提交前卡点。一次性把"隐式 any 与类型错误"暴露在编译期，从根上遏制后续腐化。可分批修复，先 `noImplicitAny` 后 `strict`。

2. **【高杠杆】补核心单测（CQ-02）**
   先覆盖"纯函数 + 边界逻辑"：搜索 `fuzzy`、工具 `util`、提交展示 `submission`、云函数 `calcScore`/`animationSubmit` 校验、以及 `cloud.ts` 的 `buildCacheTags/buildInvalidationTags`（缓存失效策略极易因改云函数而错位，最适合单测守护）。

3. **【中高】清理 listAnimations 死代码（CQ-03）**
   确认无其它调用方后删除非 snapshot 分支（约 145–256 行），消除与前端 `AnimationDatasetService` 的逻辑分叉，降低维护与误改风险。

4. **【中等】抽出共享常量/工具，消除复制粘贴（CQ-04/05/06/07/08）**
   - 前后端共享 `MIN_RATERS_FOR_WR`（CQ-04）；
   - 归一化工具单源化（CQ-05）；
   - `BV_REGEX` 常量（CQ-06）；
   - 排序 Tab 抽出 `SortTabs` 组件/共享 hook（CQ-07）；
   - 统一用 `util.formatDuration`（CQ-08）。
   工作量适中，直接降低"改一处漏多处"的回归概率。

5. **【中等】一致性小修（CQ-09/10/11/12）**
   确认审核跳转主键策略（CQ-09）；`animationMySubmissions` 加分页或显式上限（CQ-10）；去除冗余 `as any`、给微信事件补类型（CQ-11）；云请求日志加级别开关、脱敏（CQ-12）。

6. **【低】依赖与组件拆分（CQ-13/14/15）**
   移除未用 `zustand`；把 `AnimationForm`/`review-detail` 按模式拆子组件；为 `payload` 提供类型化读取辅助。

---

## 四、待确认事项

1. **死代码确认**：`listAnimations` 的非 snapshot 分支是否确无其它调用方/历史用途（如某些未上线的服务端分页入口）？确认后即可删除。
2. **审核跳转主键**：`review-list` 用 `submissions._id` 跳转是否合规？是否改为统一的显式 `reviewId` 业务键，或在 `AGENTS.md` 中明文豁免"审核类内部跳转可用 `_id`"？
3. **阈值一致性**：详情页 `v>=10` 是否应与云函数 `M_THRESHOLD` 共享同一来源？精度/语义是否需要完全一致（影响"综合评分区"展示条件）？
4. **缓存 Tag 策略回归风险**：`cloud.ts` 的 `buildCacheTags/buildInvalidationTags` 大 switch 与 12 个云函数的写后失效强耦合，是否补充单测守护（见 CQ-02）以防后续云函数改动引入缓存不一致？
5. **依赖意图**：`zustand` 是计划使用还是误引入？若短期不用建议移除（CQ-13）。
6. **构建类型检查**：当前 `build:weapp` 是否确实无 `tsc` 类型门禁（本结论基于脚本与配置推断，建议二次确认 Taro 构建配置）？如确认，按 CQ-01 补 `typecheck`。

---

### 附：关键统计（供参考）
- 前端 TS/TSX 约 6,845 行（12 组件、3 页面、7 子页、8 service、7 util、types、hooks）；云函数 JS 约 1,454 行（12 个）。
- 前端 `any` 相关引用约 47 处，集中在 `cloud.ts`（21 处，多为云函数 payload 的 `Record<string, any>`，属合理设计）。
- `tests/` 仅 1 个文件、`package.json` 无 `test` 脚本。
- 未发现 P0 级（安全越权/必崩）缺陷。
