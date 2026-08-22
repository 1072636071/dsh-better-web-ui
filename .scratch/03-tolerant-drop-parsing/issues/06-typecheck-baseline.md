# typecheck 红基线预重构

**Status:** resolved

**Blocked by:** 无

**构建内容：** 把 packages/dsh-tab-strip 的 `tsc --noEmit` 从 26 个历史错误修到零输出、退出码 0，让后续每张工单的「typecheck 绿」验收门恢复意义。错误分布与消灭方式：

- TS2540×16（drawer-store.ts 各 action 对只读 DrawerState draft 赋值）→ actions 改纯函数：读只读 draft，经局部可变副本构造新状态后整体返回替换（void=无变化）；createPersistentStore.update 接受 `T | void` 返回值，持久化+通知仍每次调用触发，store 对外语义零变化
- TS18047×2（SessionDrawer.tsx dragIndex/dropTarget 可空性）→ 可选链窄化守卫，短路语义不变
- TS2307×3（@deepseek-ai/dsh-client-runtime/client 找不到类型）→ 新增 src/dsh-client-runtime.d.ts 环境模块声明，按实际 import 最小声明并镜像宿主真实品牌类型（Branded<'SessionId'>/<'WorkspaceId'>）
- TS2307×3（node:*）+ TS2580×2（process）→ devDeps 新增 @types/node ^22.0.0

**验收标准：**

- [x] `pnpm -C packages/dsh-tab-strip typecheck` 零输出、退出码 0
- [x] 行为零变更：vitest 测试套件全数通过、未碰 lib/ 产物、未动核心包
- [x] 未以关闭 strict / 放宽类型的方式掩盖问题

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **回溯补记**：本工作先于本工单文件存在——由团队任务 t7「预重构：修复 typecheck 红基线至零错误」（tolerant-drop-squad/engineer）完成，逐项验证方式与结果如上；t7 无对应工单文件故当时未建簿记，本文件为终审修复票（t11）补记的追溯档案。完成当时门禁：vitest 2/2（当时全部套件）、`tsc --noEmit` 零输出退出码 0；后续 t2–t5 每张收尾均在绿基线上复验。
- 决策说明：①宿主运行时类型走环境模块声明而非安装依赖——该包由宿主注入（package.json dsh.client.inject），不在本 workspace 安装；②品牌 id 形状核实自宿主 deepseek-harness 的 dsh-brand/dsh-session/dsh-workspace 真实定义，非自造。
