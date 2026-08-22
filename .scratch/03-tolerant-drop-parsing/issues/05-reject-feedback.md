# 拒绝反馈

**Status:** resolved

**Blocked by:** 01

**构建内容：** 拖入彻底无法识别的内容（如一段普通文本）时，抽屉给出红色边框闪烁加轻微抖动约一秒的可见拒绝提示，状态不变——「静默失效」从此有可见答案。

**验收标准：**

- [x] 三级解析链全部未命中时拒绝反馈出现，约一秒后自动消退
- [x] 触发反馈时 store 状态与持久化均不变
- [x] 可识别的拖入不触发拒绝反馈
- [x] 纯 CSS 动画加组件本地状态实现，不引入通知基建
- [x] 文件拖拽（dataTransfer.types 含 'Files'）直接走拒绝反馈路径，不误入哨兵组、不改状态（队长补充，并入本票）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **修订（队长补充，并入本票）**：t3 的空串桶头信号有副作用——浏览器文件拖拽 types 含 'Files' 且 text/plain 为空，会误创建/填充哨兵组。修复：handleDrop 顶部守卫 `types.includes('Files')` → 直接置 rejectFlash 走拒绝路径（先红后绿驱动：红=文件拖入误建未分组组，绿=拒绝出现且状态零变化）。自本票起「无法识别」定义为：**非 Files、且三级解析链全未命中**。测试 20 条全绿、typecheck 退出码 0。CONTEXT.md「拒绝反馈」词条同步更新。

- **resolved**（tolerant-drop-squad/engineer）。实现：`handleDrop` 最终 miss 分支置本地状态 `rejectFlash`，面板类名追加 `css.rejectFlash`；1 秒定时自动消退（与 highlightFlash 同款 effect 模式）；纯 CSS 动画 `.rejectFlash`（rejectBlink 红框闪烁 250ms×4 + rejectShake 轻微抖动 500ms×2，均约 1s，抖动保留面板 translateY(-50%) 锚定），danger 色走 `--dsw-alias-state-danger-primary` 令牌带硬编码回退。零通知基建、零新依赖。测试 19 条全绿，新增 3 条：未识别文本 → 反馈类出现（fake timers 驱动 1s 消退）+ store 引用不变 + 持久化无条目（先红后绿驱动）；可识别拖入（裸会话命中/重复去重/裸目录/桶头信号）不触发拒绝且去重高亮照常；前缀与规范载荷快速路径命中不触发拒绝。收尾门槛：vitest 19/19、`tsc --noEmit` 退出码 0；核心包 git 状态干净（范围铁律核验）。
- 说明：空串 text/plain 按工单03 决策映射为桶头信号（建组/填充哨兵组），不属于拒绝路径——PRD 决策6 的直接推论；「普通文本无法识别」场景（非空未命中）才触发拒绝。

- 与 02 改同一决策点（drop 的最终 miss 分支），建议在前沿上紧随 02 执行；逻辑上仅依赖 01 的测试链。
