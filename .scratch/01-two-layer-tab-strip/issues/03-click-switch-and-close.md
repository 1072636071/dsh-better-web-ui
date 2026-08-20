# 条目点击切换 + 关闭移除 + 级联

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 用户在抽屉中点击一个 session 条目，抽屉关闭并切换到该会话的对话内容。hover 条目时看到 × 关闭按钮，点击移除条目。关闭 workspace 分组条目级联移除其下所有 session 条目。

**验收标准：**

- [ ] 点击 session 条目 → 调用 `SessionRuntime.open(sessionId)` → 抽屉关闭 → 对话区展示该会话
- [ ] hover session 条目时显示 × 关闭按钮
- [ ] 点击 × 按钮移除该 session 条目
- [ ] hover workspace 分组条目时显示 × 关闭按钮
- [ ] 点击 workspace × 按钮级联移除该分组下所有 session 条目
- [ ] 移除最后一个条目后抽屉显示空状态提示

## 评论

（评论与对话历史追加于此，新内容置于最前。）
