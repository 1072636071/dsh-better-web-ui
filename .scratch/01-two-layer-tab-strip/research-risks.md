# 调研：两层 Tab Strip 方案风险与优化空间

> 2026-08-20 · 自由模式调研

## 风险发现

### R1 · 垂直空间压力（高风险）

在典型笔记本屏幕（1366×768）上，浏览器视口约 648-688px 可用高度。两层 tab strip 的垂直开销：

| 元素 | 高度 |
|------|------|
| 现有 session header（标题行 + 视图 tab） | ~83px |
| 新增外层 workspace tab bar | ~37px |
| 新增内层 session tab bar | ~37px |
| Composer（静息态） | ~152px |
| **总计** | **~309px** |

留给对话内容的空间仅 **~339-379px**。当 composer 展开到最大（`--dsh-composer-text-max-height: 336px`），内容区仅剩 **~142-182px**——非常拥挤。

来源：`packages/client/ui-layout/src/client/columns.ts`（CENTER_MIN=640px）、`packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css`（header 83px、composer max 336px）。

### R2 · 纯插件不可行——需修改核心包（高风险）

当前 `ConversationRoot` 的 DOM 结构是：

```
<div className={css.root}>
  {renderSlot('conversation.session.header')}  ← 标题 + 视图 tab
  <div className={css.scrollBody}>
    {renderSlot('conversation.session')}        ← 对话主体
    {composerSeat}
  </div>
</div>
```

在 `conversation.session.header` 和 `conversation.session` 之间**没有现成 slot**。要插入 tab strip，必须：

1. 在 `SlotMap` 接口中新增一个 slot 定义（如 `conversation.tabs`）
2. 在 `ConversationRoot` 的注册 `children` 表中声明该 slot
3. 在 `ConversationRoot.tsx` 的 render 中调用 `renderSlot`

这意味着需要修改 `packages/client/ui-conversation` 核心包，不能作为纯独立插件实现。

来源：`packages/client/ui-conversation/src/client/apply.ts`（slot 注册 196-212 行）、`ConversationRoot.tsx`（186-194 行）。

### R3 · 与单会话模型的架构冲突（高风险）

当前 DSH 客户端是**单当前会话模型**：

- `SessionListState.current` 只有一个 `SessionId | undefined`
- `SessionSelection` 持久化形状是 `{ sessionId?: SessionId }`
- 不存在 `openSessions`、`openTabs`、`tabState` 等概念

两层 tab strip 本质上需要**多会话并行打开**的能力，这需要构建一套全新的"打开会话"跟踪机制，与现有的 `SessionRuntime.open(id)` 单选逻辑并存。

来源：`packages/client/runtime/src/client/sessions/service.ts`（80-98 行、267 行）。

### R4 · localStorage 写入无防抖（中风险）

框架的 `defineStore` persist 机制在每次状态变更时**同步写入 localStorage**（`localStorage.setItem()`），没有防抖或批处理。Tab 交互（切换、拖拽重排、滚动位置）可能产生高频状态变更，造成性能压力。

来源：`packages/client/runtime/src/client/contract/store.ts`（127-147 行，`attachPersistence` 函数）。

### R5 · session scope 导致状态丢失（低风险，但需警惕）

如果 tab strip 的 slot 使用 `session` scope，组件会在每次会话切换时被 remount（`key=sessionId`），所有 tab 状态丢失。必须使用 `session-maybe` scope。

来源：`packages/client/ui-slots/src/index.ts`（210-221 行，scope 语义定义）。

---

## 优化发现

### O1 · Session/Workspace ID 跨重启稳定——可放宽持久化约束

原方案决策 D10 说"DSH 重启不保留"，理由是 session ID 可能失效。但调研发现：

- Session ID 是 host 端用 `randomUUID()` 生成的 UUID，持久存储在服务端
- Workspace ID 同样是 UUID，持久化在 domain storage 层
- 两者都跨 DSH 重启保持稳定

这意味着可以**简化方案**：tab 状态在 DSH 重启后也能恢复，不需要"优雅降级"逻辑，实现更简单。

来源：`packages/host/apiproxy/src/api-proxy.ts`（2084 行）、`packages/workspace/workspace/src/index.ts`（293 行）。

### O2 · 用框架 defineStore 替代手动 localStorage

当前方案用 `localStorage` 手动管理 tab 状态。框架已有成熟的 `defineStore({ persist: 'dsh.tabs' })` 机制：

- 自动 rehydration（创建时从 localStorage 读取）
- 自动 write-through（状态变更时写入）
- 遵循 `dsh.` 前缀命名约定
- session scope 自动加 `.<sessionId>` 后缀

建议改为 `defineStore` 方式，减少手动代码，与项目惯例一致。

来源：`packages/client/runtime/src/client/contract/store.ts`、`packages/client/ui-conversation/src/client/stores.ts`（`createChatStore` 范例）。

### O3 · 考虑合并两层 tab 为一层（降低垂直空间压力）

鉴于 R1 的垂直空间压力，一个值得考虑的优化是**只在有外层 workspace tab 时才显示外层 bar**。如果用户只在一个工作目录下操作（最常见场景），外层 bar 不渲染，节省 ~37px。

具体策略：外层 tab 数量 ≤ 1 时隐藏外层 bar，仅显示内层 session tab bar。

### O4 · 考虑将 tab strip 融入现有 header 而非独立区域

现有 `conversation.session.header` 已有一个视图 tab bar（chat / trajectory 等）。两层新 tab 可以考虑与现有视图 tab 做视觉整合——比如外层 workspace tab 在 header 最上层，内层 session tab 替代或与视图 tab 合并。这需要仔细设计，但可以避免新增独立的 UI 区域。

### O5 · 工单 03 和 04 可合并

工单 03（关闭 + 单击替换）和 04（联动 + 级联关闭）都涉及 tab 生命周期管理，且都只阻塞于 01。合并为一个工单可以减少上下文切换：

- 合并后：03 — Tab 生命周期（关闭、替换、联动、级联）
- 验收标准合并，不增加额外复杂度

---

## 建议行动

| # | 建议 | 优先级 |
|---|------|--------|
| 1 | 更新 PRD/工单，放宽 D10 持久化约束（O1） | 高 |
| 2 | 明确 tab strip 需要修改核心包，在工单 01 中记录（R2） | 高 |
| 3 | 在工单 01 中规划"多会话打开"跟踪机制（R3） | 高 |
| 4 | 添加"外层 tab ≤ 1 时隐藏外层 bar"规则（O3） | 中 |
| 5 | 改用 defineStore persist 替代手动 localStorage（O2） | 中 |
| 6 | 考虑合并工单 03 + 04（O5） | 低 |
| 7 | 评估 tab strip 与现有 header tab 的视觉整合可行性（O4） | 低 |
