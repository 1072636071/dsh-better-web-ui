# 宽容解析：裸拖拽裁决入组

**Status:** resolved

**Blocked by:** 01

**构建内容：** 用户报告的主症状消失。从侧边栏拖一个会话进抽屉，自动归入其真实父工作目录分组（分组不存在则创建）；拖一个工作目录头，分组创建并整组填充。三级解析链落地：规范载荷 MIME → 前缀 text/plain → 裸 id 服务快照裁决。

**验收标准：**

- [x] 裸会话 id 拖入 → 条目出现在其真实父工作目录分组；父分组原先不存在则自动创建
- [x] 裸工作目录 id 拖入 → 分组创建并填充该目录下全部会话（批量去重）
- [x] 规范载荷与前缀格式仍被优先识别（快速路径不回归）
- [x] 身份裁决仅依赖 sessions/workspaces 服务快照，不依赖核心包 DOM 结构或样式类名
- [x] 解析成功路径照常写入持久化（刷新后条目保留）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **resolved**（tolerant-drop-squad/engineer）。三级解析链落地于 `SessionDrawer.tsx`：`parseDragPayload`（规范 MIME JSON → 前缀 text/plain，未命中交出裸文本）+ 新增 `adjudicateBareId`（裸 id 对照服务快照裁决；会话归属由 workspaces 快照 sessionIds 反查）；tier 1/2 代码逐字保持原样，快速路径零回归。装配层 `index.ts` 经新可选 prop `services` 把原始服务句柄下发给组件，drop 时读新鲜快照裁决；`addGroupWithSessions` 同步改为 drop 时经 `collectWorkspaceEntries` 取新鲜快照整组填充（原先 render 期 memo 有陈旧风险）。测试 7 条全绿（seam 上 RTL + fireEvent.drop/stub dataTransfer）：裸会话归真实父组+持久化、裸目录建组整组填充+持久化、前缀快速路径、规范载荷快速路径、未知文本三级全未命中 store 引用不变且持久化无条目。
- 决策与偏离说明：①无归属会话（sessionIds 反查不到）本票保持静默不落组，「未分组」哨兵承接由工单03实现——按工单依赖拆分，非遗漏；②批量去重沿用既有 `addGroupWithEntries` 唯一集逻辑，快照夹具未造重复 sessionIds 数据，去重未被专门用例驱动；③TDD 纪律：红绿由「裸会话归真实父组」用例驱动（先红后绿），裸目录分支随链同轮落地、其用例为立即绿的回归钉；④收尾门槛：包内 vitest 7/7 通过、`tsc --noEmit` 零输出退出码 0（t7 后首个功能工单在绿基线上收尾）。

- 决策依据：ADR-003；术语见根 CONTEXT.md「会话抽屉拖拽协议」。核心包拖拽源头零改动。
