import { defineConfig } from 'vitest/config'

/**
 * 测试专用配置 —— 刻意不与 vite.config.ts 共用。
 *
 * vite.config.ts 是按 mode 返回 host/client 双构建配置的函数（lib 模式、
 * 自定义产物包裹插件），语义属于"打包"；测试只需要 jsdom 环境跑源码模块图。
 * vitest 存在 vitest.config.ts 时自动优先于 vite.config.ts，构建配置零参与。
 *
 * CSS Modules：vitest 默认关闭 CSS 处理（css: false），.module.css 导入得到
 * 一个"访问键即返回键"的 Proxy —— `css.panel` → `'panel'`。类名断言直接使用
 * 源码中引用的键名即可，无需哈希展开。
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
