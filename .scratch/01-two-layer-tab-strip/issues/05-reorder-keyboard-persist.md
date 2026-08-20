# 条目拖拽重排序 + 键盘交互 + 持久化

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 用户在抽屉内拖拽调整 session 条目顺序。支持键盘快捷键 Ctrl+Shift+T 打开/关闭抽屉，Esc 关闭抽屉。页面刷新和 DSH 重启后抽屉条目恢复。

**验收标准：**

- [ ] 抽屉内 session 条目可拖拽重排序，拖拽结束顺序保存到 store
- [ ] 拖拽过程有视觉指示器
- [ ] 键盘快捷键 Ctrl+Shift+T 切换抽屉开关状态
- [ ] Esc 键关闭打开的抽屉
- [ ] 使用 `defineStore({ persist: 'dsh.drawer' })` 持久化条目列表及顺序
- [ ] 页面刷新后恢复条目
- [ ] DSH 重启后恢复条目（session/workspace ID 跨重启稳定）
- [ ] localStorage 数据损坏时优雅降级

## 评论

（评论与对话历史追加于此，新内容置于最前。）
