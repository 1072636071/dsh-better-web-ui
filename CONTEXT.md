# CONTEXT.md - 项目共享词汇

## Session Drawer（会话抽屉）

从左缘 rail 触发按钮旁弹出的紧凑浮动面板（popover，限宽 300px、限高 60vh），用于管理多会话/多工作目录的快速切换。通过 shell.overlay slot 实现，纯插件，不修改核心包。

- **条目（entry）**：抽屉中的一个会话或工作目录记录。按 workspace 分组展示。
- **触发按钮（rail）**：左缘垂直居中的固定 rail 图标按钮，点击打开/关闭抽屉。
- **分组（group）**：按工作目录（workspace）自动分组的 session 条目集合。

## 会话抽屉拖拽协议

侧边栏与会话抽屉之间的 HTML5 拖拽数据约定（见 ADR-003）。

- **裸拖拽（bare drag）**：核心包侧边栏行原生的 dragstart，仅在 `text/plain` 写入裸 id（会话 id 或 workspaceId），为侧边栏内部排序设计，不含 kind 前缀，也不含会话的父工作目录信息。
- **宽容解析（tolerant drop parsing）**：抽屉收到前缀协议与自定义 MIME 均未命中的载荷时，用 sessions/workspaces 服务快照裁决裸 id 的身份与分组归属；服务快照是裁决的唯一权威。
- **规范载荷（canonical payload）**：`application/x-dsh-drag` MIME 上的 JSON `{kind, id, workspaceId?, title?}`。预留的快速路径，当前无生产者。
- **未分组分组（ungrouped group）**：承接侧边栏「未分组」桶会话的特殊分组，使用哨兵 id 而非真实 workspaceId；拖入无归属会话或「未分组」桶头时自动创建并填充。
- **拒绝反馈（reject feedback）**：拖入内容无法识别或裁决失败时，面板红色边框闪烁加轻微抖动约一秒的纯插件视觉提示。「无法识别」= 非 Files（dataTransfer.types 含 'Files' 的文件拖拽一律直接拒绝，不落入桶头信号）、且三级解析链全未命中。
- **落点无关性（drop-position indifference）**：外部拖入的分组归属只取决于条目的真实身份（服务快照裁决），与面板内落点无关；面板内落点仅用于抽屉内部排序。

## 切换模式

- **打开抽屉** = "我要切换上下文"：面板滑出，展示所有已添加的条目
- **关闭抽屉** = "回到专注工作"：面板收起，对话区全屏展示当前会话

## 系统提示词编辑器（Prompt Override Editor）

在不修改 preset 原始文件的前提下，通过覆盖层机制编辑 DSH 系统提示词的身份段和 persona 段。

- **三级作用域覆盖**：优先级从高到低为 会话级 > 模型级 > 全局级 > 原始 preset 默认值。高优先级覆盖低优先级的同名文本。
- **身份段覆盖**：替换 `harness:identity` 段的默认文本（如为千问模型设置"你是千问AI"以激活训练记忆）。
- **persona 段覆盖**：替换当前 agent preset 的 persona 人设描述文本。
- **Settings namespace 覆盖层**：通过 `ctx.settings` 的 `prompt-overrides` namespace 存储用户编辑的覆盖文本，`system-prompt/assemble` 瀑布事件在组装时注入覆盖。

## 轮末建议按钮（Turn-end Suggestions）

会话每轮 `turn/end`（completed）后，输入框上方出现由模型建议的下一条用户消息快捷按钮；点击经 `inputActions.setDraft` 填入草稿。纯客户端插件 + 提示词约定（见 ADR-004）。

- **next 标记（链接引用定义标记）**：模型在回复正文后输出的 `[next-N]: <建议文本>` 行（≤3）。利用 mdast 语义——未引用的 link reference definition 在一切标准 markdown 渲染面自动隐形；插件按行级正则提取。
- **约定注入**：开关打开时经 `system-prompt/assemble` 瀑布事件自动追加固定约定段；关闭即停注入并隐藏按钮行。

## 标题快捷改名入口

会话第一次 completed `turn/end` 后出现的一次性「✏️ 改标题」chip：行内输入框预填当前标题，确认调 `session.rename`（即钉住标题）。完成或关闭后消失。
