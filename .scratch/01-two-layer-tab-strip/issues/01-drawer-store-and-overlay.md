# Drawer Store + Overlay 注册 + 基础渲染

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 用户能通过对话区右上角的触发按钮打开一个从顶部滑出的抽屉面板。抽屉内按工作目录分组展示已添加的会话条目。无条目时显示空状态提示。点击遮罩关闭抽屉。

**验收标准：**

- [ ] 新的 Cordis 客户端插件注册到 `shell.overlay` slot
- [ ] Drawer store 使用 `defineStore` 创建，管理条目状态（workspace 分组 + session 条目）
- [ ] 触发按钮渲染在对话区右上角（固定定位小图标）
- [ ] 点击按钮打开抽屉，面板从顶部滑入（CSS transition 动画）
- [ ] 半透明遮罩覆盖视口其余区域
- [ ] 抽屉内按 workspace 分组展示 session 条目
- [ ] 无条目时显示空状态提示文案
- [ ] 点击遮罩关闭抽屉
- [ ] 抽屉关闭时不渲染面板 DOM（触发按钮除外）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
