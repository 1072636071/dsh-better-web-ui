# 02-system-prompt-editor · 地图

## 背景

DSH 系统提示词编辑器插件——通过 Settings namespace 覆盖层，让用户在不修改 preset 原始文件的前提下编辑身份段和 persona 段。三级作用域（全局 > 模型 > 会话）按优先级链覆盖。

## 已做决策

- **ADR-002**：三级作用域覆盖体系（会话 > 模型 > 全局 > 默认）→ `docs/adr/ADR-002-three-level-scope.md`
- **编辑层级**：身份段（harness:identity）+ persona 段，分开编辑
- **存储**：`ctx.settings` 的 `prompt-overrides` namespace
- **集成 seam**：`system-prompt/assemble` 瀑布事件（唯一集成边界）
- **入口**：设置面板（全局+模型级）+ 对话区 header（会话级）

## 工单依赖图

```
01 (settings namespace + assemble hook)
 ├── 02 (设置面板 UI)
 ├── 03 (会话级覆盖弹窗)
 ├── 04 (原始文本参考 + 预览)
 └── 05 (持久化 + 变量验证)
```

## 迷雾

- `system-prompt/assemble` 瀑布事件的 API 细节需要在实现时确认（回调签名、assembly 对象结构）
- settings namespace 的大文本存储限制需确认
