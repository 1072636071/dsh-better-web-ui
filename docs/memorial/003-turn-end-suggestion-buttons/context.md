# Memorial 003 — turn-end-suggestion-buttons

## 状态

已完成（2026-08-22 · 回写确认通过：术语已入全局 CONTEXT.md，ADR-004 已同步 docs/adr/；建议归档）

## 诉求

> /jxx-grill-with-memorial 能不能在 DSH 加一个开关，如果打开这个开关。在完成一轮对话的时候，会在对话框上面给用户一些快捷输入按钮，这个按钮就是顺着上轮对话的意图的：
> 比如：
> 一轮对话结尾是：
> 文档链闭环：CONTEXT.md（词汇）→ ADR-0014/0016（互补决策）→ PRD（规格）→ issues 01/02（追踪弹实施票）。前沿就绪：01 可立即开始，02 随后。用 /jxx-implement 按 01 → 02 推进即可，两票之间建议清上下文。
>
> 就出现：
> 按钮：
> 用 /jxx-implement 按 01 → 02 推进即可，两票之间建议清上下文。
> 点击这个按钮就会把这些内容填入 对话框
>
> 追加：还有我想在第一轮对话完成后，能修改会话标题。
>
> （2026-08-22 11:49）用户委托："其他的你也自行决策。"

## 事实调查（代码库查证，2026-08-22）

- 按钮挂载点：`conversation.input.dock` 列表 slot（会话作用域），Todo(0)/Goal(10)/Queue(20) 条带的既有位置，"输入框上方独立一行"，order 越小越靠上。
- 点击填入：会话 slot 组件经标准工具包拿到 `inputActions.setDraft(text)`；输入机带 undo log。
- 轮次完成时机：会话事件流 `turn/end` 帧（completed / aborted / cancelled / max-tokens / error 区分）。
- 开关模式：`settings.general.item` slot + settings namespace（Enter 行为开关先例），durable 持久化。
- 会话重命名：`ISession.rename(title)` RPC 已存在；用户改名会**钉住**标题。侧边栏行菜单已有重命名对话框。
- Host 已有自动标题插件族（`session-title-first-prompt-llm` 等），是否启用取决于 host 组合。
- 渲染器关键事实：聊天用自研 mdast→React 渲染器（DOM 有逐字节 fixture）；**未引用的 link reference definition 不渲染任何内容**（render.tsx `case 'definition'` 渲染空）；**raw HTML 按字面文本渲染**（HTML 注释会可见）。

## 追问记录

- [2026-08-22 11:05] Q1 建议文本来源机制？→ [11:12] A1 选方案 1（模型约定输出 + 插件解析）。接受兜底与泄漏代价。
- [2026-08-22 11:07] R2 追加诉求：首轮后能修改会话标题。Q2 三方案 → [11:11] A2 选方案 2（快捷手动改名入口）。未答"是否已启用 host 自动标题"（D1 后该问题失去影响面，按已澄清处理）。
- [2026-08-22 11:12] Q3 约定注入机制？→ [11:12] A3 选方案 1（开关即自动注入固定约定段，YAGNI 不做可编辑模板）。
- [2026-08-22 11:15] Q4 标记格式？→ 用户选方案 1（链接引用定义），并委托其余决策自行裁定。

## 决策汇总

### D1 — 标题修改采用"快捷手动改名入口"（R2）

见 D9 细化。纯客户端，不依赖模型约定。

### D2 — 建议文本来源：模型约定输出 + 插件解析（主功能）

插件在 `turn/end` 后解析最后一条 assistant 消息的约定标记，提取建议渲染为按钮。零额外 LLM 请求。

### D3 — 约定注入机制：开关即自动注入

开关打开时，插件经 `system-prompt/assemble` 瀑布事件自动追加固定约定说明；关闭则不注入。文案插件内置、全局生效、所有 agent preset 一致。（ADR-004 关联）

### D4 — 标记格式：链接引用定义【ADR-004】

模型在回复正文之后输出最多三行：

```
[next-1]: <建议的下一条用户消息全文>
[next-2]: <…>
[next-3]: <…>
```

- 利用 mdast 语义：未引用 definition 在 DSH 聊天及一切标准 markdown 渲染面自动隐形，零渲染器改动。
- 插件对最后一条 assistant 原文做行级正则提取（`^\[next-(\d+)\]: <(.+)>$`）。
- 否决替代：HTML 注释（本渲染器字面可见）；围栏代码块（可见、视觉重复）；前端启发式（误判率高）；host 二次生成（成本+越界）。

### D5 — 触发与生命周期（委托裁定）

- 仅 `turn/end` 且 reason=completed 时提取展示；aborted/cancelled/error/max-tokens 不出。
- 新一轮 `turn/start` 即清空旧行；新建议到来整行替换。
- 点击按钮：`setDraft` **替换**当前草稿（完整下一条消息语义，undo log 兜底误触），点击后整行消失。
- 行尾提供 × 手动关闭。
- 行状态为会话作用域的易失内存（不跨页面刷新持久）：刷新丢失可接受，下一轮自然再生。

### D6 — 数量上限（委托裁定）

最多 3 条，按 next-N 序号升序取前 3，超出截断；0 条则整行不渲染。

### D7 — 开关位置与作用域（委托裁定）

Settings › General 新增一行 toggle「轮末建议按钮」，settings namespace `turn-end-suggestions` durable 持久化。关闭 = 同时停止注入约定并隐藏行。全局生效。

### D8 — dock 顺序（委托裁定）

`conversation.input.dock` 注册 order 30：Todo/Goad/Queue 之后、最贴近输入卡——"这里的内容进输入框"的空间隐喻。

### D9 — 标题入口细化（委托裁定）

- 每会话第一次 completed `turn/end` 后出现「✏️ 改标题」chip（与建议行同一 dock entry 内右侧）。
- 点击展开行内小输入框，预填当前 displayTitle；确认调 `sessions.binding(id).session.rename(trimmed)`（成功即 pin），失败就地报错不关框。
- chip 直到用户完成改名或点 × 才消失（每会话一次性提醒，不检测 pin 态——客户端无从便宜得知，已侧边栏改过名的会话多看一次 × 即可）。

### D10 — 注入文案要点（委托裁定，实施期定稿措辞）

固定中文约定段：当且仅当本轮存在明确、单一的下一步行动时，在回复最末输出 `[next-N]: <…>` 行（≤3）；内容必须是可直接作为下一条用户消息发送的完整措辞；无明确下一步则完全不输出；标记不得出现在正文中间。

### D11 — 实现边界（委托裁定）

本仓库新增 package（`packages/dsh-turn-end-suggestions/` 或定名后调整），纯 client plugin，模式对齐 dsh-tab-strip（`inject` 服务 + `apply(ctx)` + slots.inject 两阶段注册）；不改 deepseek-harness 核心；测试沿用 vitest + SlotTestRuntime 既有接缝模式。

## 待澄清

（空 — "host 自动标题是否启用"在 D1 选定方案 2 后失去影响面）

## ADR

- ADR-004-link-reference-definition-markers.md（memorial 内，待回写确认同步全局 docs/adr/）
