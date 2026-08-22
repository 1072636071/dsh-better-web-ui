/**
 * 环境模块声明 —— 宿主提供的外部契约。
 *
 * `@deepseek-ai/dsh-client-runtime` 由 DSH 宿主在插件加载时注入
 * （见 package.json 的 dsh.client.inject），不在本 workspace 安装；
 * 本包源码只 import 其类型，运行时值一律来自宿主。此处按源码实际
 * 使用到的导出做最小声明，形状镜像宿主侧真实定义（deepseek-harness）：
 *
 *   - Branded<B>   = string & { readonly [BRAND]: B }   （@deepseek-ai/dsh-brand）
 *   - SessionId    = Branded<'SessionId'>               （dsh-session 拥有）
 *   - WorkspaceId  = Branded<'WorkspaceId'>             （dsh-workspace 拥有）
 */
declare module '@deepseek-ai/dsh-client-runtime/client' {
  declare const BRAND: unique symbol

  /** 跨边界 id 的编译期品牌：类型层不可互换，运行时即普通字符串。 */
  export type Branded<B extends string> = string & { readonly [BRAND]: B }

  /** 会话稳定 id —— 镜像宿主 dsh-session 的品牌 id。 */
  export type SessionId = Branded<'SessionId'>

  /** 工作目录稳定 id —— 镜像宿主 dsh-workspace 的品牌 id。 */
  export type WorkspaceId = Branded<'WorkspaceId'>
}
