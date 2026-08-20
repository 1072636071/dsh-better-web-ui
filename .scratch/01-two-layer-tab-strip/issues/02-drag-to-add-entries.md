# 从侧边栏拖入条目 + 去重

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 用户从侧边栏拖拽一个 session 到抽屉面板，创建该 session 的条目（自动归入对应 workspace 分组）；拖拽一个 workspace header 到抽屉，创建该 workspace 分组。如果条目已存在，不重复创建，改为高亮闪烁已有条目。

**验收标准：**

- [ ] 从侧边栏拖拽 session 到打开的抽屉面板，创建 session 条目并归入对应 workspace 分组
- [ ] 如果该 workspace 分组不存在，自动创建
- [ ] 从侧边栏拖拽 workspace header 到抽屉，创建 workspace 分组
- [ ] 拖入已存在的 session 条目时不重复创建，高亮闪烁已有条目
- [ ] 拖入已存在的 workspace 分组时不重复创建，高亮闪烁已有分组
- [ ] 拖拽到抽屉外区域时不创建条目
- [ ] 拖拽过程抽屉面板有视觉反馈（drop 区域高亮）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
