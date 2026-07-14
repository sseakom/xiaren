# 阶段 0（低风险高杠杆）技术债优化 — 产品需求文档（简单 PRD）

- **Language**：中文（与需求一致）
- **Programming Stack**：Taro4 + React18 + TypeScript + NutUI + 微信云开发（保持现状，本次不引入新功能框架）
- **Project Name**：`sha_diao_taro_stage0`
- **原始需求复述**：基于全量健康体检报告，实现体检报告「阶段 0（低风险高杠杆）」三件事——H-02 类型门禁、H-03 补核心单测、H-04 清死代码。本次为内部技术债优化，非新功能，走标准 SOP（PM 出 PRD → 架构师设计+任务分解 → 工程师实现 → QA 测试）。

---

## 一、目标与范围

**一句话目标**：在不新增任何业务功能的前提下，落地体检报告「阶段 0」三件事（H-02 类型门禁 / H-03 补核心单测 / H-04 清死代码），冻结类型债、补齐核心回归护栏、收敛维护面。

**明确不在范围内**：
- 不新增任何业务功能 / 页面 / 云函数；
- 不处理体检报告「阶段 1 / 2」的高风险项；
- 不重构业务逻辑（仅抽离可单测的纯函数，严禁改变既有行为）；
- 不引入新的状态管理 / UI 库；
- 不处理除 `listAnimations` 非 snapshot 分支外的其它死代码；
- 不要求 100% 测试覆盖率，仅优先覆盖纯函数与高回归风险点。

---

## 二、用户故事 / 干系人视角（维护者 / 开发者）

- 作为维护者，我希望 `typecheck` 在 CI 与提交前卡点，以免类型债持续累积而无人察觉。（H-02）
- 作为开发者，我希望开启 `noImplicitAny` 后存量类型错误被分批收敛，以免一次性改动阻塞日常开发。（H-02）
- 作为开发者，我希望核心纯函数与云函数校验逻辑有单测守护，以免后续重构无意破坏排序 / 打分 / 提交校验等高频路径。（H-03）
- 作为维护者，我希望新增测试只需 `npm test` 一条命令即可运行，结果稳定可重复。（H-03）
- 作为维护者，我希望删除 `listAnimations` 非 snapshot 分支后功能零回归且代码面更小，以免长期分叉的死路径继续误导后人。（H-04）
- 作为审查者，我希望删除死代码前已确认无任何调用方，以免误删仍在使用的逻辑。（H-04）

---

## 三、需求池

> 优先级：P0 = 必须（阶段 0 验收门槛）；P1 = 应当（强烈建议本期完成）；P2 = 可选（视工期）。

### H-02 类型门禁

| 编号 | 需求 | 优先级 | 验收标准 | 关联体检项 |
|------|------|--------|----------|-----------|
| S0-01 | 在 `tsconfig.check.json` 中开启 `noImplicitAny: true`（移除现有 `false`），作为类型门禁基线 | P0 | `tsconfig.check.json` 中 `noImplicitAny` 为 `true`；`strict` 是否同步开启见待确认 Q1 | H-02 |
| S0-02 | 新增 `package.json` 脚本 `typecheck`，执行 `tsc --noEmit -p tsconfig.check.json` | P0 | `npm run typecheck` 可运行；CI / 提交前可调用 | H-02 |
| S0-03 | 将 `typecheck` 接入 CI（若有）与 Git 提交前钩子（husky / lint-staged 或等价），失败即阻断 | P0 | 本地提交触发 typecheck，错误或超阈值即阻断提交；CI 流水线含该步骤或明确「暂以本地钩子替代」（见 Q2/Q3） | H-02 |
| S0-04 | 存量 `noImplicitAny` 错误分批修复，达到「每次提交不引入新错误」门槛（或基线容忍策略） | P1 | typecheck 在 main 分支可重复通过（零新增错误 / 不高于基线）；附修复清单 | H-02 |
| S0-05 | 对 `noImplicitAny` 无法覆盖的 `.js` 云函数代码，维持 ESLint 校验（已具备），不强制 tsc | P2 | 云函数无 tsc 要求，ESLint 仍生效 | H-02 |

### H-03 补核心单测

| 编号 | 需求 | 优先级 | 验收标准 | 关联体检项 |
|------|------|--------|----------|-----------|
| S0-06 | 引入单测运行器（vitest 或 jest），新增 `test` 脚本，纳入 CI | P0 | `npm test` 可运行现有 + 新增用例；默认非 watch 模式 | H-03 |
| S0-07 | 保留并纳管现有 `tests/request-cache.test.ts`（适配运行器，不改断言语义） | P1 | 该用例在 runner 下 0 失败 | H-03 |
| S0-08 | 为 `utils/fuzzy.ts` 增加单测：`tokenize` 分词、`fuzzyScore` 五档评分（exact/startsWith/includes/有序/全包含/0）及大小写、空输入边界 | P0 | 覆盖各评分分支与异常输入（空 text/keyword、纯符号） | H-03 |
| S0-09 | 为 `utils/util.ts` 增加单测：`formatNumber`（k/w/亿 边界与负数/NaN）、`formatDuration`（数字/字符串/非法输入）、`formatTime`、`formatDateTime`、`parseTags`（中英文逗号/分号/空白） | P0 | 覆盖正负边界与非法输入返回降级值 | H-03 |
| S0-10 | 为 `utils/submission.ts` 增加单测：`getSubmissionDisplay` 在 create/correction/correction_delete 三态下正确提取 title/cover/upName/bvid/duration/url | P1 | 三态全覆盖，含 payload/target 为空兜底 | H-03 |
| S0-11 | 为云函数 `animationSubmit` 的入参校验抽离纯函数并单测：`validateCreatePayload`（缺字段/空值/duration 非正/bvid 格式错）、`validateCorrectionPayload`、`validateDeletePayload`（reason 长度边界） | P0 | 每个校验分支有正反例；BV 正则覆盖合法/非法 | H-03 |
| S0-12 | 为云函数 `calcScore` 的入参校验与贝叶斯 WR 计算抽离纯函数并单测：空 `animation_bvid` 返回错误、WR 公式在 v 极小/极大时向 C 收敛、distribution 聚合 | P0 | 覆盖缺参、无评分、高评分人数三态 | H-03 |
| S0-13 | 为云函数 `userService` 的入参 sanitize/normalize 抽离纯函数并单测：`sanitizeProfileInput` 过滤 `is_admin` 等危险字段、`normalizeUser` 对 `is_admin`/缺失字段兜底 | P0 | 断言恶意 profile 不会写入 `is_admin`；缺失字段取 existing/默认值 | H-03 |
| S0-14 | 为 `services/cloud.ts` 的 `buildCacheTags` / `buildInvalidationTags` 增加单测（各云函数 case 的 tag 生成、userScoped 分支、动画 bvid 解析），通过 mock `Taro.getStorageSync` 固定 scope | P1 | 覆盖 listAnimations/calcScore/rating/collection/userService/animationSubmit/animationReview 主路径及 userScoped 行为 | H-03 |
| S0-15 | 为其余高回归风险云函数校验逻辑，按风险排序补充单测（视工期） | P2 | 至少覆盖 1–2 个额外云函数的校验入口 | H-03 |

### H-04 清死代码

| 编号 | 需求 | 优先级 | 验收标准 | 关联体检项 |
|------|------|--------|----------|-----------|
| S0-16 | 确认 `listAnimations` 非 snapshot 分支（快速路径 `canUseDbPagination`/`DB_SORT_CONFIG`、慢速全量路径）无任何调用方（前端仅 `action:'snapshot'`） | P0 | 全局搜索 `listAnimations` 调用仅 `animationDataset.ts`（action:'snapshot'）与 `cloud.ts` 内部分支；附调用方核对记录 | H-04 |
| S0-17 | 删除 `cloudfunctions/listAnimations/index.js` 非 snapshot 分支，仅保留 snapshot 读取；保留被 snapshot 复用的 `fetchAllAnimations` / `parseDurationToSec` / `toSnapshotItem` 等函数 | P0 | 删除后 `exports.main` 仅处理 `action==='snapshot'`；snapshot 行为（字段裁剪、bvid 过滤、total）与删除前一致（脚本化前后对比或轻量单测验证） | H-04 |
| S0-18 | 清理仅被非 snapshot 分支使用的辅助函数 `compare` / `matchCategory` / `canUseDbPagination` / `DB_SORT_CONFIG`（删除后确认无其它引用） | P1 | grep 这些符号无残留引用；TypeScript/ESLint 无未使用告警（视 H-02 配置） | H-04 |
| S0-19 | 清理 `cloud.ts` 中 `listAnimations` 的非 snapshot 读缓存策略（`getCloudRequestPolicy` 的 listAnimations case：移除 `if(action==='snapshot')` 分支判断，统一返回 `{mode:'never'}`）；同步处理失去唯一调用点的 `getAction`（移除或确认保留） | P0 | `listAnimations` 一律 `mode:'never'`，无失效/读缓存副作用；`getAction` 无 TS 未使用报错（注意 `noUnusedLocals` 已开） | H-04 |

---

## 四、技术约束与风险

1. **H-02 存量类型错误**：当前 `tsconfig.check.json` 的 `noImplicitAny:false`，开启后将暴露大量存量 implicit-any（`services/*`、`utils/*` 中的 `any` / `Record<string,any>` 透传、云函数返回值）。验收门槛需与团队约定（零新增错误 vs 基线容忍），避免一次性阻塞开发。建议「先开门禁、再分批修」的渐进策略。
2. **H-02 与 H-04 的耦合**：S0-19 移除 listAnimations 的 action 分支判断后，私有函数 `getAction`（cloud.ts:86）将失去唯一调用点（仅 line 312 使用）。当前 `tsconfig.check.json` 的 `noUnusedLocals:false` 不会报错；但若后续收紧该配置或开启 full strict，需同步清理 `getAction`。建议本次一并移除以保持整洁，或架构设计阶段明确保留理由。
3. **H-04 删除前必须确认无调用方**：`listAnimations` 非 snapshot 分支删除前必须完成全局调用方核对（S0-16）。前端动画列表 / 搜索 / 排序已全部迁移到本地快照（`animationDataset.ts`），云函数仅响应 snapshot；但需确认无任何页面 / 历史埋点 / 其它服务仍以默认 action 或分页参数（publish_time/play_count_desc 排序、category 筛选路径）调用。
4. **H-03 云函数单测的可测试性**：`calcScore`/`animationSubmit`/`userService` 为 `.js` 且顶部 `require('wx-server-sdk')`，直接 import 会在测试环境抛错。需在架构阶段决策：抽离纯校验 / 计算函数为独立可 import 模块（推荐，零运行时依赖），或在测试中以 mock 注入 `wx-server-sdk`。抽离时严禁改变既有行为（保持「重构不改行为」）。
5. **H-03 cloud.ts 测试依赖 Taro 运行时**：`buildCacheTags`/`buildInvalidationTags` 依赖 `getCurrentUserScopeToken` → `Taro.getStorageSync`。测试需 mock `Taro.getStorageSync` 以固定 scope token，保证 userScoped 分支可断言。
6. **H-03 运行器选型影响包体积 / CI**：vitest 与 jest 对 Taro 小程序环境（依赖 jsdom / happy-dom、模块解析含 `@` 别名）配置不同；选型需兼顾与现有 tsconfig paths 别名（`@/*`）及 babel 转译的兼容（Q4）。
7. **H-02 CI 现状**：仓库当前无 CI 配置（无 `.github/workflows`、无 `.gitlab-ci`、无 husky）。「CI / 提交前卡点」需明确落地形态——补充 CI 工作流，还是仅本地 Git hook（husky）+ 文档约定（Q2/Q3）。
8. **行为保持（H-04）**：改动后 snapshot 输出（字段裁剪、bvid 过滤、`total=all.length`、`pageSize=all.length`）必须与现状完全一致；建议为 snapshot 路径补充一个轻量单测或脚本化前后对比验证，作为回归保护。
9. **关于 `animationDataset.ts:190` 的澄清**：经核对，`animationDataset.ts` 中 `listAnimations` 仅以 `action:'snapshot'` 调用（line 190），该处无死路径判断。任务描述中的「死路径判断」实际指 `cloud.ts:314-318` 的 `action` 分支判断，已在 S0-19 覆盖；前端调用点本身无需改动，仅需 S0-16 确认其为唯一正确调用方。

---

## 五、待确认问题

- **Q1（H-02）**：`noImplicitAny` 之外，是否同期开启完整 `strict:true`（strictNullChecks 已开，但 strictFunctionTypes / strictBindCallApply / useUnknownInCatchVariables 等未开）？还是仅开 `noImplicitAny` 作为阶段 0 基线、strict 留待后续？
- **Q2（H-02）**：「CI / 提交前卡点」落地形态？当前无 CI。是（a）新增 GitHub Actions 等 CI 工作流，还是（b）仅接 husky 本地 pre-commit 钩子 + 团队约定？
- **Q3（H-02）**：是否需要 husky + lint-staged 做提交前自动 typecheck？CI 环境是否可用（当前无 CI 配置）？
- **Q4（H-03）**：单测运行器选 vitest 还是 jest？考虑 Taro 小程序 + `@` 别名 + babel 的兼容性与团队熟悉度。
- **Q5（H-03）**：`typecheck` 与 `test` 是否纳入现有 `build:weapp` 前置，或仅 CI / 提交前触发（不阻塞本地 dev watch）？
- **Q6（H-03）**：覆盖率门槛？阶段 0 是否设最低覆盖率（如核心纯函数 80%+），还是仅「有可运行套件 + 优先覆盖清单通过」即可？
- **Q7（H-04）**：删除非 snapshot 分支后，是否同步移除仅被其使用的 `compare` / `matchCategory`（S0-18）？还是保留以待后续可能的服务端分页需求？（建议移除，因前端已长期分叉到本地快照）
- **Q8（H-04）**：`getAction` 在 S0-19 后是否一并移除（见风险 2）？
