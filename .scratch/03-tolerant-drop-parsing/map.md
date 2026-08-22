# Map: 会话抽屉宽容拖入解析

## 背景

用户报障：把会话和工作目录拖入会话抽屉后没有任何反应。根因是拖拽数据契约只有消费者没有生产者——抽屉认规范载荷/前缀格式，侧边栏裸拖拽只写裸 id，解析失败静默返回。grill 会话四项决策后产出 PRD，本目录工单为其追踪弹拆解。

## 已做决策

- 修复方向：抽屉侧宽容解析，服务快照为裁决权威，零核心包改动 → `docs/adr/ADR-003-tolerant-drop-parsing.md`
- 未归组会话与「未分组」桶头 → 哨兵 id 的「未分组」分组自动承接
- 裁决失败 → 面板内红框闪烁+抖动的纯插件拒绝反馈
- 落点语义 → 统一归真实父组（落点无关性），顺带修条目吞 drop 缺陷
- 测试 seam → 单一边界：插件客户端入口注入假服务+真 store+真组件；新增 vitest/jsdom/testing-library 基建
- 工单 01 resolved → 测试链落地（vitest ^3.2.7 + jsdom + RTL，独立 vitest.config.ts），入口 seam 冒烟两用例真绿（建组持久化 / 重复拖入高亮不重建）；为测试导出既有 DrawerWrapper/createPersistentStore；typecheck 零新增错误（并启用 allowImportingTsExtensions）；详见 `issues/01-test-infra-and-seam-smoke.md`
- 预重构 resolved → 包内 typecheck 红基线 26 错清零：drawer-store actions 改纯函数整体替换、SessionDrawer 可空窄化、新增宿主运行时环境声明（镜像 Branded id）、@types/node；「typecheck 绿」验收门恢复意义
- 工单 02 resolved → 三级解析链落地（parseDragPayload + adjudicateBareId 服务快照裁决，sessionIds 反查归属）；装配层经 services prop 下发原始服务、整组填充改 drop 时读新鲜快照；无归属会话暂静默（03 接管）；测试 7 条全绿、typecheck 绿；详见 `issues/02-tolerant-drop-adjudication.md`
- 工单 03 resolved → 核心桶头键值核实为空串（ui-workspace UNGROUPED_KEY=''）；空串=桶头信号映射到抽屉哨兵键 `__ungrouped__`（品牌化常量入 drawer-store），未归组会话与桶头填充共用普通分组动作，成员由 collectUngroupedEntries 新鲜快照收集；测试 12 条全绿、typecheck 绿；详见 `issues/03-ungrouped-bucket.md`
- 工单 04 resolved → 条目级 drop/dragOver 以 dragIndex 非空为唯一拦截条件，外部拖入一律冒泡面板级统一裁决（落点无关性）；内部同组重排与跨组零副作用均有 DOM 级回归钉；测试 16 条全绿、typecheck 绿；详见 `issues/04-drop-position-indifference.md`
- 工单 05 resolved → drop 最终 miss 分支驱动 rejectFlash 本地状态 + 纯 CSS 红框闪烁/抖动约 1s（danger 令牌带回退），store 与持久化零变化，全部可识别路径不误触发；空串仍按桶头信号处理（03 决策）；测试 19 条全绿、typecheck 绿；详见 `issues/05-reject-feedback.md`
- 工单 05 修订（队长补充）→ types 含 'Files' 的文件拖拽直接拒绝，堵住空串信号误建哨兵组的副作用；「无法识别」定义收敛为「非 Files 且三级全未命中」（已入根 CONTEXT.md 词条）；测试 20 条全绿、typecheck 绿
- 五张工单全部 resolved → 前沿清空，t6 最终审查门就绪（reviewer）；全量变更仅 packages/dsh-tab-strip 源码与测试 + 工单簿记，核心包 git 干净

## 上下文指针

- 规格：`PRD.md`（ready-for-agent）
- 词汇表新增段：根 `CONTEXT.md`「会话抽屉拖拽协议」（裸拖拽、宽容解析、规范载荷、未分组分组、拒绝反馈、落点无关性）
- 前身工单：`.scratch/01-two-layer-tab-strip/issues/02-drag-to-add-entries.md`（缺生产端契约的半成品）
- 工单依赖：01 → {02, 05}，02 → {03, 04}；前沿顺序建议 01→02→03→04→05
