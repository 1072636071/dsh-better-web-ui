# ADR-001: Session Drawer（会话抽屉）方案

## 状态

已决策 (2026-08-20)

## 背景

DSH 对话区需要支持多会话/多工作目录的快速切换。初始方案为"两层 tab strip"（外层 workspace tab + 内层 session tab），嵌入在对话区顶部。

经调研发现两个关键风险：
1. **垂直空间压力**：两层 tab bar（~74px）加上现有 header（83px）和 composer（152px），在 768px 笔记本上对话内容仅剩 ~339px
2. **核心包改动**：对话区 DOM 中无现成 slot，需修改 ui-conversation 核心包

## 决策

放弃嵌入式 tab strip，改为**抽屉面板（Session Drawer）**方案：

- 通过 `shell.overlay`（已有 list/root slot）注册浮动抽屉组件
- 从顶部滑出面板（~40-50% 视口高度），带遮罩
- 按 workspace 分组展示 session 条目
- 点击条目 → 关闭抽屉 → 切换到该会话
- 纯插件实现，不修改任何核心包代码

## 被否决的替代方案

1. **两层 tab strip（嵌入核心包）**：需在 ui-conversation 核心包新增 slot，垂直空间压力大
2. **两层 tab strip（shell.overlay 浮动层模拟）**：需要 JS 持续计算对话区位置，定位脆弱，z-index 冲突
3. **单层 tab strip**：缺乏工作目录级别的上下文隔离

## 后果

- **正面**：零核心包改动，对话区垂直空间零开销，抽屉收起时完全不影响工作
- **负面**：切换会话需要先打开抽屉（多一步操作），不如嵌入式 tab 即时可见
- **缓解**：键盘快捷键 Ctrl+Shift+T 降低操作成本
