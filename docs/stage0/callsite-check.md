# S0-16 调用方核对记录 — listAnimations 非 snapshot 分支

## 结论

前端动画列表 / 搜索 / 排序已全部迁移到本地快照（`animationDataset.ts`），`listAnimations`
云函数**仅**以 `action: 'snapshot'` 被调用。删除非 snapshot 分支（快速 DB 分页 + 慢速全量路径）
**无调用方受影响**。

## 全局 grep 证据

执行（仓库根目录）：

```
grep -rn "listAnimations" miniprogram/ --include="*.ts" --include="*.tsx"
grep -rn "getAction" miniprogram/ cloudfunctions/
```

### `listAnimations` 的引用点

| 位置 | 上下文 | 是否 snapshot |
|---|---|---|
| `miniprogram/services/cloud.ts:118` | `buildCacheTags` 的 `case 'listAnimations'` | tag 生成，与 action 无关 |
| `miniprogram/services/cloud.ts:314` | `getCloudRequestPolicy` 的 `case 'listAnimations'` | 已统一为 `{ mode: 'never' }` |
| `miniprogram/services/animationDataset.ts:190` | `CloudService.callCloudSafe('listAnimations', { action: 'snapshot' }, ...)` | **是，唯一业务调用点** |

→ 业务侧调用方仅 `animationDataset.ts:190`，且硬编码 `action: 'snapshot'`。

### `getAction` 的引用点（S0-19 关联）

| 位置 | 说明 |
|---|---|
| `miniprogram/services/cloud.ts:86` | `function getAction(data?)` 定义 |
| `miniprogram/services/cloud.ts:312` | `const action = getAction(data)` —— **唯一调用点** |
| `cloudfunctions/animationReview/index.js:88` | `async function getAction(event)` —— **独立模块，不在此次清理范围** |
| `cloudfunctions/animationReview/index.js:238` | `return getAction(event)` —— animationReview 内部调用 |

→ `cloud.ts` 的 `getAction` 仅 line 312 一处调用；删除后 `getCloudRequestPolicy` 改为内联
  `typeof data?.action === 'string' ? data.action : ''`，其余 case 行为不变。
→ `animationReview/index.js` 的 `getAction` 为不同模块，不在本次清理范围内，保持不变。

### 已删除符号的全局残留核对

删除 `compare` / `matchCategory` / `canUseDbPagination` / `DB_SORT_CONFIG` 后：

```
grep -rn "compare\|matchCategory\|canUseDbPagination\|DB_SORT_CONFIG" miniprogram/ cloudfunctions/
```

→ 无任何残留引用（animationReview 的 `getAction` 不受影响，其引用 `compare`/`matchCategory` 等
  符号不存在）。

## 影响面

- 删除非 snapshot 分支后，`exports.main` 仅处理 `action === 'snapshot'`，其余 action 返回错误。
- 前端调用方 `animationDataset.ts:190` 行为完全不变（仍为 snapshot 读取）。
- `cloud.ts` 的 `listAnimations` 缓存策略统一为 `{ mode: 'never' }`：无读缓存、无失效副作用。
