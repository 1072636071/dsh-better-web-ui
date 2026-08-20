# 01-session-drawer · 地图

## 背景

在 DSH 对话区添加一个可从顶部滑出的抽屉面板（Session Drawer），专门管理多会话/多工作目录的快速切换。纯插件实现（shell.overlay），不修改核心包。

## 已做决策

- **方案演化**：原"两层 tab strip"方案 → 抽屉方案。原因：垂直空间压力（R1）、核心包改动风险（R2）。详见 `research-risks.md`。
- **集成方式**：shell.overlay（已有 list/root slot），纯插件，零核心改动
- **状态模型**：插件 store 自管条目列表，点击条目时复用 SessionRuntime.open() 切换
- **持久化**：defineStore({ persist: 'dsh.drawer' })，刷新和重启均恢复

## 工单依赖图

```
01 (store + overlay + 基础渲染)
 ├── 02 (拖入条目 + 去重)
 ├── 03 (点击切换 + 关闭 + 级联)
 ├── 04 (搜索筛选)
 └── 05 (重排序 + 键盘 + 持久化)
```

## 迷雾

- 无已知技术风险。shell.overlay 和 defineStore 在项目中均有充分先例。
