# Settings namespace + assemble 瀑布事件覆盖

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 插件的 host 半注册 `prompt-overrides` settings namespace，并监听 `system-prompt/assemble` 瀑布事件。当用户通过 settings 配置了覆盖文本后，下一次系统提示词组装时自动按三级优先级链（会话 > 模型 > 全局 > 默认）替换身份段和/或 persona 段。这是整个功能的核心引擎——没有这个工单，其他工单的 UI 无法产生实际效果。

**验收标准：**

- [ ] 插件 host 半注册 `prompt-overrides` settings namespace，支持读写覆盖文本
- [ ] Settings key 结构：`global.identity`、`global.persona`、`model:<modelName>.identity`、`model:<modelName>.persona`、`session:<sessionId>.identity`、`session:<sessionId>.persona`
- [ ] 监听 `system-prompt/assemble` 瀑布事件，在组装时读取 settings 覆盖配置
- [ ] 三级优先级链正确：会话级覆盖模型级，模型级覆盖全局级，全局级覆盖默认值
- [ ] 身份段和 persona 段独立覆盖：覆盖身份段不影响 persona 段，反之亦然
- [ ] 无覆盖配置时，系统提示词与未安装插件时完全一致
- [ ] 覆盖修改后立即生效（下一次 assemble 调用使用新值），无需重启
- [ ] 单元测试覆盖：三级优先级、清除回退、独立覆盖

## 评论

（评论与对话历史追加于此，新内容置于最前。）
