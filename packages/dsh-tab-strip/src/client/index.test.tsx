/**
 * Seam smoke tests — issue 01「测试基建与 seam 冒烟」.
 *
 * Everything drives the plugin client entry boundary (the single seam chosen
 * by the PRD test decisions): in-memory fake sessions/workspaces services +
 * real createPersistentStore(createDrawerStore()) + real DrawerWrapper,
 * rendered with React Testing Library.
 *
 * Drag input is a synthetic HTML5 drop event whose stubbed dataTransfer.getData
 * returns a controlled value (the sidebar's prefixed text/plain format).
 *
 * Assertions target external behavior only: rendered DOM text and CSS-module
 * feedback classes, store state, localStorage persistence — never internal
 * function calls or implementation details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createPersistentStore, DrawerWrapper } from './index.ts'
import { UNGROUPED_WORKSPACE_ID, createDrawerStore, type DrawerState } from './drawer-store.ts'
import css from './SessionDrawer.module.css'

// ── Fixtures ───────────────────────────────────────────

const WORKSPACE_ID = 'ws-1'
const SESSION_ID = 's-1'
const WORKSPACE_TITLE = 'Workspace One'
const SESSION_TITLE = 'Alpha Session'

/** In-memory fake cordis services. Only contract used: list.getSnapshot(). */
function makeFakeServices() {
  return {
    sessions: {
      list: {
        getSnapshot: () => ({
          items: [],
          byId: {
            [SESSION_ID]: { sessionId: SESSION_ID, title: SESSION_TITLE },
          },
        }),
      },
      open: () => {},
    },
    workspaces: {
      list: {
        getSnapshot: () => ({
          byId: {
            [WORKSPACE_ID]: { workspaceId: WORKSPACE_ID, title: WORKSPACE_TITLE },
          },
          items: [
            { workspaceId: WORKSPACE_ID, title: WORKSPACE_TITLE, sessionIds: [SESSION_ID] },
          ],
        }),
      },
    },
  }
}

/** Sidebar-row drop payload in the prefixed text/plain format "kind:id:workspaceId". */
function sidebarSessionDrop(sessionId: string, workspaceId: string) {
  return {
    dataTransfer: {
      getData: (type: string) => (type === 'text/plain' ? `session:${sessionId}:${workspaceId}` : ''),
    },
  }
}

type PersistentDrawerStore = ReturnType<typeof createPersistentStore<DrawerState>>

/** Render the real client entry component with fake services + real store. */
function renderDrawer(opts?: {
  seed?: (store: PersistentDrawerStore) => void
  services?: ReturnType<typeof makeFakeServices> | ReturnType<typeof makeTolerantServices> | ReturnType<typeof makeByIdOnlyWorkspacesServices>
}) {
  const store = createPersistentStore(createDrawerStore())
  opts?.seed?.(store)
  const services = opts?.services ?? makeFakeServices()
  const utils = render(
    <DrawerWrapper store={store} sessions={services.sessions} workspaces={services.workspaces} />,
  )
  const panel = () => utils.container.querySelector(`.${css.panel}`) as HTMLElement | null
  return { store, panel }
}

function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: '打开会话抽屉' }))
}

// ── 裸拖拽宽容解析 fixtures（ADR-003）────────────────
// 侧边栏行原生 dragstart 只写裸 id 到 text/plain：无 kind 前缀、无父目录信息。

/** Bare sidebar-row drop: text/plain carries the raw id only. */
function bareDrop(bareId: string) {
  return {
    dataTransfer: {
      getData: (type: string) => (type === 'text/plain' ? bareId : ''),
    },
  }
}

/**
 * 服务快照形状对齐宿主 cordis sessions/workspaces：
 * sess-alpha/sess-beta 归 ws-real-1；sess-loose 不属于任何真实目录（由哨兵「未分组」分组承接）。
 * extraLooseIds 追加额外的未归组会话（仅特定用例使用，不影响既有断言）。
 */
function makeTolerantServices(extraLooseIds: string[] = []) {
  const looseById = Object.fromEntries(
    ['sess-loose', ...extraLooseIds].map((id) => [id, { sessionId: id, title: id === 'sess-loose' ? '散置会话' : `${id} 标题` }]),
  )
  return {
    sessions: {
      list: {
        getSnapshot: () => ({
          items: [],
          byId: {
            'sess-alpha': { sessionId: 'sess-alpha', title: 'Alpha 会话' },
            'sess-beta': { sessionId: 'sess-beta', title: 'Beta 会话' },
            ...looseById,
          },
        }),
      },
      open: () => {},
    },
    workspaces: {
      list: {
        getSnapshot: () => ({
          byId: {
            'ws-real-1': { workspaceId: 'ws-real-1', title: '工作台·一号', sessionIds: ['sess-alpha', 'sess-beta'] },
          },
          items: [
            { workspaceId: 'ws-real-1', title: '工作台·一号', sessionIds: ['sess-alpha', 'sess-beta'] },
          ],
        }),
      },
    },
  }
}

/** workspaces 快照仅有 byId 形状（无 items 数组）——快照形状兼容性用例。 */
function makeByIdOnlyWorkspacesServices() {
  const base = makeTolerantServices()
  return {
    sessions: base.sessions,
    workspaces: {
      list: {
        getSnapshot: () => ({
          byId: {
            'ws-real-1': { workspaceId: 'ws-real-1', title: '工作台·一号', sessionIds: ['sess-alpha', 'sess-beta'] },
          },
        }),
      },
    },
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

// ── Smoke cases ────────────────────────────────────────

describe('<DrawerWrapper> via the client entry seam', () => {
  it('opens via the rail click and creates a group + entry from a dropped sidebar session', () => {
    const { store, panel } = renderDrawer()

    // Closed at first: only the trigger rail is rendered.
    expect(panel()).toBeNull()
    openDrawer()
    expect(panel()).not.toBeNull()
    expect(screen.getByText('从侧边栏拖入会话或工作区到此抽屉')).toBeTruthy()

    // Drop a sidebar row onto the open panel.
    fireEvent.drop(panel()!, sidebarSessionDrop(SESSION_ID, WORKSPACE_ID))

    // Rendered DOM mirrors the new group + entry (live service names win).
    expect(screen.getByText(WORKSPACE_TITLE)).toBeTruthy()
    expect(screen.getAllByText(SESSION_TITLE)).toHaveLength(1)

    // Store state agrees…
    expect(store.getState().groups).toHaveLength(1)
    expect(store.getState().groups[0].entries.map((e) => e.sessionId)).toEqual([SESSION_ID])

    // …and localStorage persistence was written through.
    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups[0].entries.map((e) => e.sessionId)).toEqual([SESSION_ID])
  })

  it('dropping an already-present entry flashes its highlight class without duplicating', () => {
    // Seed the existing entry through the real store action, then render.
    const { store, panel } = renderDrawer({
      seed: (store) => store.actions.addEntry(WORKSPACE_ID, WORKSPACE_TITLE, SESSION_ID, SESSION_TITLE),
    })

    openDrawer()
    expect(screen.getAllByText(SESSION_TITLE)).toHaveLength(1)
    expect(panel()!.classList.contains(css.highlightFlash)).toBe(false)

    // Drop the SAME session again → highlight flash on the existing row, no duplicate.
    fireEvent.drop(panel()!, sidebarSessionDrop(SESSION_ID, WORKSPACE_ID))

    const entryRow = screen.getAllByText(SESSION_TITLE)[0].closest(`.${css.entry}`)
    expect(entryRow).not.toBeNull()
    expect(entryRow!.classList.contains(css.highlightFlash)).toBe(true)

    // Still exactly one entry — in DOM, store, and storage alike.
    expect(screen.getAllByText(SESSION_TITLE)).toHaveLength(1)
    const allEntries = store.getState().groups.flatMap((g) => [...g.entries])
    expect(allEntries).toHaveLength(1)
    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups.flatMap((g) => [...g.entries])).toHaveLength(1)
  })
})

describe('<DrawerWrapper> 裸拖拽宽容解析（ADR-003）', () => {
  it('裸会话 id 拖入：归入其真实父工作目录分组，父组不存在则自动创建，并写入持久化', () => {
    // 侧边栏裸拖拽只带裸 id —— 抽屉必须用服务快照裁决身份与归属。
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop('sess-alpha'))

    // 渲染 DOM：真实父组「工作台·一号」自动出现，条目在其中（live 名优先）。
    expect(screen.getByText('工作台·一号')).toBeTruthy()
    expect(screen.getAllByText('Alpha 会话')).toHaveLength(1)

    // store：分组键是真实 workspaceId（sessionIds 反查得出），不是裸 id 本身。
    const state = store.getState()
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].workspaceId).toBe('ws-real-1')
    expect(state.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-alpha'])

    // 解析成功路径照常写穿 localStorage（刷新后条目保留）。
    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups[0].workspaceId).toBe('ws-real-1')
    expect(persisted.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-alpha'])
  })

  it('裸工作目录 id 拖入：分组自动创建并整组填充（批量去重），并写入持久化', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop('ws-real-1'))

    // 渲染 DOM：分组出现，目录下全部会话一次性填充。
    expect(screen.getByText('工作台·一号')).toBeTruthy()
    expect(screen.getAllByText('Alpha 会话')).toHaveLength(1)
    expect(screen.getAllByText('Beta 会话')).toHaveLength(1)

    const state = store.getState()
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-alpha', 'sess-beta'])

    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-alpha', 'sess-beta'])
  })

  it('前缀格式快速路径不回归：session:<id>:<ws> 按显式载荷处理，归属不经裁决改写', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    // ws-explicit 不在服务快照中 —— 若被错误地送去裁决，将无组可归。
    fireEvent.drop(panel()!, {
      dataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? 'session:sess-alpha:ws-explicit' : ''),
      },
    })

    const state = store.getState()
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].workspaceId).toBe('ws-explicit')
    expect(screen.getByText('ws-explicit')).toBeTruthy()
    expect(state.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-alpha'])
  })

  it('规范载荷快速路径不回归：application/x-dsh-drag JSON 优先于 text/plain 识别', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    // 两种 MIME 同时给值：规范载荷必须胜出，归属用其自带 workspaceId。
    fireEvent.drop(panel()!, {
      dataTransfer: {
        getData: (type: string) =>
          type === 'application/x-dsh-drag'
            ? JSON.stringify({ kind: 'session', id: 'sess-alpha', workspaceId: 'ws-canonical', title: '规范载荷条目' })
            : 'session:sess-alpha:ws-plain',
      },
    })

    const state = store.getState()
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].workspaceId).toBe('ws-canonical')
    expect(state.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-alpha'])
    expect(screen.getByText('ws-canonical')).toBeTruthy()
  })

  it('未知文本拖入：三级解析全未命中，store 与持久化零变化', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    expect(screen.getByText('从侧边栏拖入会话或工作区到此抽屉')).toBeTruthy()
    const before = store.getState()

    fireEvent.drop(panel()!, bareDrop('一段普通文本'))

    // 引用相等：没有发生任何 update（拒绝反馈在工单05接入，本票保持静默忽略）。
    expect(store.getState()).toBe(before)
    expect(screen.getByText('从侧边栏拖入会话或工作区到此抽屉')).toBeTruthy()
    // 持久化里没有产生任何分组或条目（开抽屉的 toggle 本身会合法写穿状态）。
    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups).toEqual([])
  })

  it('未归组会话拖入：归入哨兵键的「未分组」分组并持久化', () => {
    // sess-loose 不在任何工作目录的 sessionIds 里 —— 反查不到即未归组（PRD 决策5）。
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop('sess-loose'))

    // 渲染 DOM：哨兵分组以固定标题「未分组」出现，散置会话在其中。
    expect(screen.getByText('未分组')).toBeTruthy()
    expect(screen.getAllByText('散置会话')).toHaveLength(1)

    // store：分组键是抽屉侧哨兵 id（非真实 workspaceId），不是裸 id 或空标题。
    const state = store.getState()
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].workspaceId).toBe(UNGROUPED_WORKSPACE_ID)
    expect(state.groups[0].title).toBe('未分组')
    expect(state.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-loose'])

    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups[0].workspaceId).toBe(UNGROUPED_WORKSPACE_ID)
    expect(persisted.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-loose'])
  })

  it('「未分组」桶头键值拖入：哨兵分组创建并填充快照中全部未归组会话', () => {
    // 核心侧边栏桶头行 dragstart 写 row.key = UNGROUPED_KEY = ''（空串）。
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop(''))

    // 哨兵分组出现；成员恰好是未被任何真实目录收录的全部会话。
    expect(screen.getByText('未分组')).toBeTruthy()
    expect(screen.getAllByText('散置会话')).toHaveLength(1)
    expect(screen.queryByText('Alpha 会话')).toBeNull()
    expect(screen.queryByText('Beta 会话')).toBeNull()

    const state = store.getState()
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].workspaceId).toBe(UNGROUPED_WORKSPACE_ID)
    expect(state.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-loose'])

    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups[0].workspaceId).toBe(UNGROUPED_WORKSPACE_ID)
  })

  it('桶头信号：快照仅有 byId 形状时仍正确排除已归组、只填未归组', () => {
    // workspaces 快照无 items 数组——与 items 形状同权兼容。
    const { store, panel } = renderDrawer({ services: makeByIdOnlyWorkspacesServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop(''))

    expect(screen.getByText('未分组')).toBeTruthy()
    expect(screen.getAllByText('散置会话')).toHaveLength(1)
    expect(screen.queryByText('Alpha 会话')).toBeNull()
    expect(screen.queryByText('Beta 会话')).toBeNull()

    const state = store.getState()
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-loose'])
  })

  it('真实父目录存在的会话不会被误判为未归组', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    // 先让哨兵组存在，再拖入有真实父目录的会话。
    fireEvent.drop(panel()!, bareDrop('sess-loose'))
    fireEvent.drop(panel()!, bareDrop('sess-alpha'))

    const state = store.getState()
    expect(state.groups).toHaveLength(2)
    const ungrouped = state.groups.find((g) => g.workspaceId === UNGROUPED_WORKSPACE_ID)
    const real = state.groups.find((g) => g.workspaceId === 'ws-real-1')
    expect(ungrouped?.entries.map((e) => e.sessionId)).toEqual(['sess-loose'])
    expect(real?.entries.map((e) => e.sessionId)).toEqual(['sess-alpha'])
  })

  it('哨兵分组与普通分组行为一致：重复拖入高亮去重、折叠、移除条目后随空消亡', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop('sess-loose'))
    expect(screen.getAllByText('散置会话')).toHaveLength(1)

    // 去重：重复拖入同一未归组会话 → 高亮闪烁、不重建条目。
    fireEvent.drop(panel()!, bareDrop('sess-loose'))
    const entryRow = screen.getAllByText('散置会话')[0].closest(`.${css.entry}`)
    expect(entryRow!.classList.contains(css.highlightFlash)).toBe(true)
    expect(store.getState().groups[0].entries).toHaveLength(1)

    // 折叠：点击哨兵组头 → 条目隐藏、箭头进入折叠态（与普通分组同款交互）。
    fireEvent.click(screen.getByText('未分组'))
    expect(screen.queryByText('散置会话')).toBeNull()
    expect(document.querySelector(`.${css.groupArrowCollapsed}`)).not.toBeNull()

    // 展开回来再从 × 移除唯一条目 → 组随之消亡（removeEntry 的普通语义）。
    fireEvent.click(screen.getByText('未分组'))
    expect(screen.getAllByText('散置会话')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '移除会话 散置会话' }))
    expect(screen.queryByText('散置会话')).toBeNull()
    expect(screen.queryByText('未分组')).toBeNull()
    expect(store.getState().groups).toHaveLength(0)
    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups).toHaveLength(0)
  })

  it('哨兵分组内的条目拖拽排序与普通分组一致（内部重排不受外部拖入修复影响）', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices(['sess-loose-2']) })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop(''))
    expect(screen.getByText('未分组')).toBeTruthy()

    // 桶头填充后顺序：[散置会话, sess-loose-2 标题]。
    const entryTitles = () =>
      [...document.querySelectorAll(`.${css.entryTitle}`)].map((el) => el.textContent)
    expect(entryTitles()).toEqual(['散置会话', 'sess-loose-2 标题'])

    // 抽屉内部排序：拖第一个条目落到第二个上 → 同组内重排。
    // jsdom 的拖拽事件需要 dataTransfer 桩（effectAllowed/setData 会被组件写入）。
    const reorderTransfer = {
      effectAllowed: '',
      dropEffect: '',
      getData: () => '',
      setData: () => {},
    }
    const rows = () => [...document.querySelectorAll(`.${css.entry}`)] as HTMLElement[]
    fireEvent.dragStart(rows()[0], { dataTransfer: reorderTransfer })
    fireEvent.drop(rows()[1], { dataTransfer: reorderTransfer })

    expect(entryTitles()).toEqual(['sess-loose-2 标题', '散置会话'])
    expect(store.getState().groups[0].entries.map((e) => e.sessionId)).toEqual(['sess-loose-2', 'sess-loose'])
  })
})

describe('<DrawerWrapper> 落点无关性（PRD 实现决策 8）', () => {
  /** jsdom 拖拽桩：条目 dragStart/dragOver 会写入 effectAllowed/setData。 */
  const reorderTransfer = {
    effectAllowed: '',
    dropEffect: '',
    getData: () => '',
    setData: () => {},
  }
  const entryRows = () => [...document.querySelectorAll(`.${css.entry}`)] as HTMLElement[]

  it('外部裸拖入落在已有条目上：冒泡到面板统一处理，归属与落点无关', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    // 先整组填入 ws-real-1（alpha+beta 两个条目占住面板面积）。
    fireEvent.drop(panel()!, bareDrop('ws-real-1'))
    expect(screen.getAllByText('Alpha 会话')).toHaveLength(1)

    // 未归组会话拖到「已有条目」（alpha 行）上 —— 不被条目行吞掉，
    // 冒泡到面板级宽容解析，归入哨兵「未分组」分组。
    fireEvent.drop(entryRows()[0], bareDrop('sess-loose'))

    const state = store.getState()
    const ungrouped = state.groups.find((g) => g.workspaceId === UNGROUPED_WORKSPACE_ID)
    expect(ungrouped?.entries.map((e) => e.sessionId)).toEqual(['sess-loose'])
    expect(screen.getByText('未分组')).toBeTruthy()
    // 原有条目原样保留。
    expect(state.groups.find((g) => g.workspaceId === 'ws-real-1')?.entries).toHaveLength(2)
  })

  it('外部裸拖入落在分组头上：同样冒泡到面板统一处理', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop('ws-real-1'))

    // 未归组会话拖在「工作台·一号」分组头文字上 —— 组头无拦截，冒泡面板。
    fireEvent.drop(screen.getByText('工作台·一号'), bareDrop('sess-loose'))

    const state = store.getState()
    expect(state.groups.find((g) => g.workspaceId === UNGROUPED_WORKSPACE_ID)?.entries.map((e) => e.sessionId))
      .toEqual(['sess-loose'])
    expect(screen.getByText('未分组')).toBeTruthy()
  })

  it('重复会话拖到已有条目上：高亮去重而非新建，与落点无关', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    // 面板级先整组建入 [alpha, beta]，DOM 行序与之一致。
    fireEvent.drop(panel()!, bareDrop('ws-real-1'))
    // 已存在的 alpha 再拖到 beta 行上 → 面板级去重高亮落在 alpha 条目。
    fireEvent.drop(entryRows()[1], bareDrop('sess-alpha'))

    const alphaRow = screen.getAllByText('Alpha 会话')[0].closest(`.${css.entry}`)
    expect(alphaRow!.classList.contains(css.highlightFlash)).toBe(true)
    const all = store.getState().groups.flatMap((g) => [...g.entries])
    expect(all.map((e) => e.sessionId)).toEqual(['sess-alpha', 'sess-beta'])
  })

  it('内部排序拖拽仍只做同组重排，不被外部拖入改动破坏', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop('ws-real-1'))
    fireEvent.drop(panel()!, bareDrop('sess-loose'))
    // DOM 顺序：[alpha, beta | 散置]。
    expect(store.getState().groups.map((g) => g.workspaceId)).toEqual(['ws-real-1', UNGROUPED_WORKSPACE_ID])

    // 同组内：alpha 拖到 beta 上 → 重排生效。
    fireEvent.dragStart(entryRows()[0], { dataTransfer: reorderTransfer })
    fireEvent.drop(entryRows()[1], { dataTransfer: reorderTransfer })
    const wsEntries = () => store.getState().groups.find((g) => g.workspaceId === 'ws-real-1')!.entries
    expect(wsEntries().map((e) => e.sessionId)).toEqual(['sess-beta', 'sess-alpha'])

    // 跨组：ws 组条目拖到「未分组」条目上 → 只清状态，不做跨组移动/裁决。
    fireEvent.dragStart(entryRows()[0], { dataTransfer: reorderTransfer })
    fireEvent.drop(entryRows()[2], { dataTransfer: reorderTransfer })
    expect(wsEntries().map((e) => e.sessionId)).toEqual(['sess-beta', 'sess-alpha'])
    expect(store.getState().groups.find((g) => g.workspaceId === UNGROUPED_WORKSPACE_ID)!.entries)
      .toHaveLength(1)
    // 全库仍只有两个分组、三条目——内部拖拽没有触发任何宽容解析副作用。
    expect(store.getState().groups.flatMap((g) => [...g.entries])).toHaveLength(3)
  })

  it('内部排序悬停另一条目：出现条目级落点高亮（entryDropTarget）', () => {
    const { panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, bareDrop('ws-real-1'))
    expect(entryRows()).toHaveLength(2)

    // 拖 alpha 悬停 beta：条目级落点指示线出现。
    // （dragOver 处理器依赖 dragIndex——闭包必须看到拖拽开始后的最新状态。）
    fireEvent.dragStart(entryRows()[0], { dataTransfer: reorderTransfer })
    fireEvent.dragOver(entryRows()[1], { dataTransfer: reorderTransfer })

    expect(entryRows()[1].classList.contains(css.entryDropTarget)).toBe(true)
  })
})

describe('<DrawerWrapper> 拒绝反馈（PRD 实现决策 9）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('三级解析全未命中：面板拒绝反馈类出现、约一秒自动消退，store 与持久化零变化', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    expect(panel()!.classList.contains(css.rejectFlash)).toBe(false)
    const before = store.getState()

    // 一段普通文本：三级解析链（规范载荷→前缀→快照裁决）全部未命中。
    fireEvent.drop(panel()!, bareDrop('一段无法识别的普通文本'))

    // 可见拒绝出现在面板上；状态引用不变、持久化无任何分组条目。
    expect(panel()!.classList.contains(css.rejectFlash)).toBe(true)
    expect(store.getState()).toBe(before)
    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups).toEqual([])

    // 约 1 秒后自动消退（组件本地状态定时清理，与 highlightFlash 同款模式）。
    act(() => { vi.advanceTimersByTime(1000) })
    expect(panel()!.classList.contains(css.rejectFlash)).toBe(false)
  })

  it('可识别的拖入（命中/去重/桶头）不触发拒绝反馈', () => {
    const { panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    // 裸会话命中：建组归组，无拒绝。
    fireEvent.drop(panel()!, bareDrop('sess-alpha'))
    expect(panel()!.classList.contains(css.rejectFlash)).toBe(false)
    // 重复命中：去重走高亮而非拒绝。
    fireEvent.drop(panel()!, bareDrop('sess-alpha'))
    expect(panel()!.classList.contains(css.rejectFlash)).toBe(false)
    expect(screen.getAllByText('Alpha 会话')[0].closest(`.${css.entry}`)!.classList.contains(css.highlightFlash))
      .toBe(true)
    // 裸目录命中与桶头信号命中：均不拒绝。
    fireEvent.drop(panel()!, bareDrop('ws-real-1'))
    fireEvent.drop(panel()!, bareDrop(''))
    expect(panel()!.classList.contains(css.rejectFlash)).toBe(false)
  })

  it('前缀与规范载荷快速路径命中同样不触发拒绝反馈', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    fireEvent.drop(panel()!, {
      dataTransfer: { getData: (type: string) => (type === 'text/plain' ? 'session:sess-alpha:ws-explicit' : '') },
    })
    fireEvent.drop(panel()!, {
      dataTransfer: {
        getData: (type: string) =>
          type === 'application/x-dsh-drag'
            ? JSON.stringify({ kind: 'workspace', id: 'ws-real-1', title: '工作台·一号' })
            : '',
      },
    })
    expect(panel()!.classList.contains(css.rejectFlash)).toBe(false)
    expect(store.getState().groups.map((g) => g.workspaceId)).toEqual(['ws-explicit', 'ws-real-1'])
  })

  it('文件拖拽（types 含 Files）：直接拒绝反馈，不误入哨兵组、不改状态', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    const before = store.getState()

    // 浏览器文件拖拽的典型形状：types 含 'Files'、text/plain 为空 ——
    // 若按空串桶头信号处理会误创建「未分组」分组，必须直接拒绝。
    fireEvent.drop(panel()!, {
      dataTransfer: {
        types: ['Files'],
        getData: () => '',
      },
    })

    // 可见拒绝出现……
    expect(panel()!.classList.contains(css.rejectFlash)).toBe(true)
    // ……但哨兵组没有被误创建，状态与持久化零变化。
    expect(store.getState()).toBe(before)
    expect(store.getState().groups).toHaveLength(0)
    expect(screen.queryByText('未分组')).toBeNull()
    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups).toEqual([])
  })

  it('规范载荷 kind 未知：合法 JSON 但非 session/workspace → 拒绝反馈且状态不变', () => {
    const { store, panel } = renderDrawer({ services: makeTolerantServices() })

    openDrawer()
    const before = store.getState()

    // JSON 本身合法，但 kind 不在协议枚举内（如 {kind:'x'}）——不能静默吞掉。
    fireEvent.drop(panel()!, {
      dataTransfer: {
        getData: (type: string) =>
          type === 'application/x-dsh-drag' ? JSON.stringify({ kind: 'x', id: 'mystery' }) : '',
      },
    })

    expect(panel()!.classList.contains(css.rejectFlash)).toBe(true)
    expect(store.getState()).toBe(before)
    const persisted = JSON.parse(localStorage.getItem('dsh.drawer')!) as DrawerState
    expect(persisted.groups).toEqual([])
  })
})
