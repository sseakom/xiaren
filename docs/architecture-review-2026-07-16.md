# 架构评审与优化建议 — sha-diao-taro

> 评审日期：2026-07-16
> 范围：Taro 4 + React 18 + TypeScript + NutUI React（前端）/ 微信云开发（后端 14 云函数）
> 方法：静态走读核心基础设施 + 全量探索 agent 扫描

---

## 一、总体评价

**优点（值得保留）：**
- 分层清晰：`page/component → services → cloud.ts → 云函数 → DB`，页面不直接触库。
- 统一云函数调用层 `cloud.ts`：超时（30s）、日志、请求去重（in-flight）、按策略缓存、写后精准 tag 失效，设计成熟。
- 业务主键统一 `bvid`，避免 `_id` 散落，关联字段命名一致。
- AGENTS.md 约束到位：除 `listAnimations` 外其余云函数均不直读 `animations` 集合（已核对满足）。
- 缓存核心（`requestCacheCore.ts`）LRU + TTL + tag 失效逻辑正确。

**主要短板：** 几处真实 bug、缓存读写放大、类型弱、测试覆盖缺口、列表分页缺失。总体属于“可用但需加固”的状态。

---

## 二、必须修的 Bug（P0 / P1）

### P0 — phoneLogin 兜底解密路径必崩
- 位置：`cloudfunctions/phoneLogin/index.js:33`
- 问题：`require('./WXBizDataCrypt')` 但 `phoneLogin/` 目录仅有 `index.js` + `package.json`，**该文件不存在**。
- 影响：走 `cloudID` 路径正常（微信推荐，零依赖解密）；但只要前端传 `encryptedData + iv` 兜底，就会进入 catch，返回「未拿到手机号」→ 手机号登录失败。
- 修复二选一：
  1. 补齐标准 `WXBizDataCrypt.js`（微信开放数据解密模块）；
  2. 更干净：**删除兜底分支，统一走 cloudID**，消除死代码与误导注释。

### P1 — animationReview.correction_delete 无 `.limit(1)`，可能误删多条
- 位置：`cloudfunctions/animationReview/index.js:167-170`
  ```js
  await db.collection('animations').where({ bvid: ... }).remove();
  ```
- 问题：`remove()` 不带 `limit`，且未确认 bvid 唯一。若历史数据因 bug 出现重复 bvid，一次审核会删掉所有同名记录，**不可恢复**。
- 修复：`.where({ bvid }).limit(1).remove()`；并给 `animations.bvid` 建**唯一索引**兜底。

### P1 — animationMySubmissions / animationReview.list 无分页、无 total，数据静默截断
- 位置：`animationMySubmissions/index.js:32`（`.limit(50)`）、`animationReview/index.js:76`（`.limit(100)`）
- 问题：写死 limit，返回不含 `total`。用户提交 >50 条 / 待审 >100 条时更早记录**看不到且无提示**。
- 修复：支持分页（`skip + limit` 或游标）+ 返回 `total`；小程序侧加分页 / 加载更多。

### P1 — animationSubmit 服务端未校验 target 存在性
- 位置：`cloudfunctions/animationSubmit/index.js`（correction / correction_delete 分支）
- 问题：仅信任前端“target 存在”，服务端未查 `animations` 校验 `target_bvid`。
  - correction 指向不存在动画也能入库，审核时才暴露；
  - correction_delete 指向不存在 bvid 时 `approve` 返回「原动画不存在」，但 submission 已卡在审核中。
- 修复：submit 时服务端查一次 `animations` 校验 `target_bvid`（create 的 bvid 唯一性校验已有，可复用）。

---

## 三、性能问题

### 缓存读写放大（高优先级，热路径）
- 事实：所有缓存条目存于**单一 JSON 键** `cloud_request_cache_v1`（maxSize 768KB，`requestCacheCore.ts:48-52`）。
- 每次 `get/set/invalidate` 都要 `readState`（**JSON.parse 整个 blob**）+ `writeState`（**JSON.stringify 整个 blob**，`requestCacheCore.ts:344`）。
- 更严重：`get` 命中时 `touchEntry` 改 `updatedAt`（`requestCacheCore.ts:158-161`），随后**无条件 `writeState(state)`**（`requestCacheCore.ts:197-198`）——即**每次缓存命中都触发一次全量序列化回写**。
- 影响：缓存读是热路径（每次只读云查询都走）。当数据集填满 768KB 后，每次命中都同步序列化近 1MB JSON 到本地存储，小程序主线程会卡顿 / 掉帧。
- 建议：
  1. 读命中**不要自动写回**（去掉 touchEntry 触发的 writeState，或仅在真正变化时写）；
  2. 按用户 scope / 函数名**分区存储**（多个 storage key），减小单次序列化体积；
  3. 内存缓存 + **异步 / 节流持久化**（debounce `writeState`），避免每次同步写；
  4. 修正语义：`updatedAt` 不应随读变化（仅 `lastAccessedAt` 该变）。

### 搜索 O(n·k) 全量扫描（技术债，量小暂可不处理）
- 位置：`miniprogram/services/animationDataset.ts` 的 `searchPage`
- 问题：对全量快照（数百项）× 每项多 tag 调用 `fuzzyScore`（tokenize + indexOf），随数据集增长线性变慢。
- 建议：预建倒排索引（按 title / tag token 索引 bvid），降为 O(命中数)；或先按 tag 做 Set 交集粗筛再精排。

### calcScore 实时全量聚合
- 位置：`cloudfunctions/calcScore/index.js`（Bayes 聚合管道）
- 问题：每次评分页 / 列表调用都实时扫 `ratings` 全量聚合。
- 现状：前端/CloudService 已对 `calcScore` 缓存 3min，但聚合本身成本高。
- 建议：评分变更时**增量重算**并落 `animations.score`，列表直接读，避免实时聚合。

---

## 四、代码质量与类型

### 弱类型（与 tsconfig 非严格互为因果）
- 事实：`CloudFunctionData = Record<string, any>`、`callFunction` 返回 `any`（`cloud.ts:11,90`），`business.ts` 全量 `r?.data?.x` 无接口约束。
- 根因：`tsconfig.check.json:8` `strict:false` + `noImplicitAny:true`（仅禁止隐式 any，显式 any 泛滥）。
- 建议：分阶段收敛——先为云函数出参定义按 `name+action` 的 discriminated union 类型，再逐步收紧 `strict`。

### 字符串驱动的缓存 tag 分发易漂移
- 位置：`buildCacheTags` / `buildInvalidationTags`（`cloud.ts:104-305`）
- 问题：靠 `switch(name) + data.action` 手动维护 tag，新增 action 极易漏加失效 tag。
- 建议：用**配置表（policy map）**驱动 tag 规则，新增 action 只改一张表，并用注册校验强制覆盖。

### 重复代码
- `business.ts` 中 `RatingService.listByUser` 与 `CollectionService.listByUser` 结构几乎相同；`ListSort`（`business.ts` 内）与 `DatasetListSort`（`animationDataset.ts` 内）重复定义。
- 建议：抽公共 `listByUser(collectionName, ...)` 与统一 sort 工具。

### 绕过单一入口
- 位置：`user.ts` 的 `uploadAvatar` / `resolveFileUrl` 直接调 `Taro.cloud.uploadFile` / `getTempFileURL`；`callUserService` 直接读 `.result`。
- 问题：绕过统一超时 / 日志 / 缓存策略，日志风格不一致，难排查。
- 建议：文件上传也封装进 `CloudService`（或新增 `FileService`），统一治理。

---

## 五、测试与质量门禁缺口

- 有 eslint 依赖但 `package.json` **无 `lint` 脚本**（建议加 `lint` + `lint:fix`）。
- vitest **无覆盖率配置**（无 thresholds、无 `@vitest/coverage`）。
- 现有测试集中在纯函数：`fuzzy` / `util` / `request-cache` / `cloud-cache-tags` / `calcScore.score` / `animationSubmit.validation` / `userService.profile`。
- **未覆盖（高危）：**
  - `business.ts`、`cloud.ts.callFunction` 的缓存 / 去重 / 失效**串联**（最关键路径）；
  - `user.ts`、搜索页；
  - 多个云函数业务分支（上面提到的分页 / 删除 / target 校验）；
  - 无任何组件 / 页面测试。
- 建议优先级：补 `cloud.ts` 缓存串联测试 + `animationReview` / `animationMySubmissions` / `animationSubmit` 边界测试（分页、重复 bvid、target 校验）+ 设覆盖率门槛（如 statements ≥ 60%）。

---

## 六、构建 / 工程化

- 缺 `lint` 脚本（见上）。
- `tsconfig.check.json` 非严格，CI 类型检查形同虚设，弱类型蔓延。
- 多端构建脚本齐全（weapp/swan/alipay/...），但当前只产出 weapp，其余平台未验证——若不做多端可移除，减少误导。
- 依赖：`@nutui/icons-react-taro` 为 `3.0.2-cpp.3.beta.9`（beta 图标包），注意稳定性。

---

## 七、落地优先级排序

**P0（影响功能正确性）**
1. phoneLogin `WXBizDataCrypt` 缺失 → 补文件或删兜底分支
2. animationReview `correction_delete` 加 `.limit(1)` + `animations.bvid` 建唯一索引

**P1（边界 / 性能隐患）**
3. animationMySubmissions / animationReview.list 加分页 + total
4. animationSubmit 服务端校验 target 存在性
5. 缓存读命中免写回 + 分区存储（性能）
6. cloud.ts 缓存串联测试 + 云函数边界测试

**P2（质量 / 可维护性）**
7. 分阶段收紧 tsconfig strict + 定义云函数响应类型
8. tag 规则配置化
9. 抽重复代码、收口 user.ts 入口
10. 加 lint 脚本 + 覆盖率门槛
11. 搜索倒排索引（数据量上来再做）

---

## 八、已核实的关键文件

| 文件 | 关键行 | 结论 |
|---|---|---|
| `cloudfunctions/phoneLogin/index.js` | 33 | 缺 `WXBizDataCrypt`，兜底解密失效 |
| `cloudfunctions/animationReview/index.js` | 167-170 | `remove()` 无 limit，可能误删多条 |
| `cloudfunctions/animationReview/index.js` | 76 | `list` 写死 limit(100) 无 total |
| `cloudfunctions/animationMySubmissions/index.js` | 32 | 写死 limit(50) 无 total |
| `miniprogram/utils/requestCacheCore.ts` | 48-52 / 197-198 / 344 | 单键 768KB、读命中全量写回 |
| `miniprogram/services/cloud.ts` | 104-305 | 字符串 switch 维护缓存 tag，易漂移 |
| `tsconfig.check.json` | 8 | `strict:false`，弱类型根源 |
| `package.json` | 31-32 | 无 `lint` 脚本、无覆盖率配置 |
