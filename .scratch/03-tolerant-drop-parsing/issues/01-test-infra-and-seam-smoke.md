# 测试基建与 seam 冒烟

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 插件包获得可运行的自动化测试链（vitest + jsdom + testing-library），并经由插件客户端入口边界（注入内存假 services + 真 store + 真组件）写出第一条针对现有行为的绿灯测试，证明该 seam 可以承载本功能所有后续验收。

**验收标准：**

- [x] 新增 test 脚本，一键运行全部测试
- [x] 至少一条现有行为测试经插件客户端入口边界通过；推荐用「拖入已存在的会话 → 高亮闪烁类出现且不产生重复条目」作冒烟用例
- [x] 合成 HTML5 拖拽事件可用 stub dataTransfer（getData 返回受控值）驱动组件
- [x] 现有 build 与 typecheck 不受影响

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **resolved**（tolerant-drop-squad/engineer）。基建：包内 devDeps 新增 vitest ^3.2.7、jsdom ^26.1.0、@testing-library/react ^16.1.0（+ dom ^10.4.1）、react/react-dom ^18.3.1、@types/react-dom（对齐 peer 18.x）；新增 `test`/`test:watch` 脚本；独立 vitest.config.ts（environment jsdom，不借用按 mode 分叉的 vite.config.ts）。CSS Modules 走 vitest 默认管线即可（css 关闭时类名键原样返回，断言直接用源码键名）。冒烟经客户端入口 seam：假 services（`list.getSnapshot()` 返回 `{byId}`/`{items}`）+ 真 `createPersistentStore(createDrawerStore())` + 真 `DrawerWrapper`（为测试导出既有函数，未新增 seam）；`fireEvent.drop` 注入 stub dataTransfer（text/plain `session:<id>:<ws>` 前缀格式）。两条用例真绿：拖入新会话建组并写穿 localStorage；拖入已存在条目出现 highlightFlash 类且 DOM/store/localStorage 均无重复。TDD 红绿：先红（导出缺失 TypeError）后绿。
- typecheck 对照改动前基线（28 错）零新增，并修复 2 个 TS5097（tsconfig 启用 `allowImportingTsExtensions`，noEmit 下安全）。注意：基线本就有 26 个历史错误（缺 `@deepseek-ai/dsh-client-runtime` 类型、drawer-store 只读草稿赋值、dragIndex 可空性、vite.config.ts 缺 @types/node），属既有状态，非本票引入。`pnpm build` 双半区通过，client.js 的 ModuleLoader 包裹与 CSS 内联完好。

- 这是本仓库第一批测试；样式参照 DSH 核心仓库 ui-workspace 的行组件测试（vitest + testing-library 风格）。见 PRD 测试决策。
