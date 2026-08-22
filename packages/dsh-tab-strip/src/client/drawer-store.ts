/**
 * Drawer store: manages session drawer entries (workspace groups + session entries).
 *
 * State shape:
 *   groups[] — ordered list of workspace groups
 *     .workspaceId — stable UUID
 *     .title — display name
 *     .collapsed — whether this group is collapsed
 *     .entries[] — ordered list of session entries within this group
 *       .sessionId — stable UUID
 *       .title — display name
 *   open — whether the drawer is currently open
 *   searchQuery — current search filter text
 */

import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'

// ── Ungrouped sentinel (PRD 实现决策 6) ────────────────

/**
 * 「未分组」分组的抽屉侧哨兵键 —— 非真实 workspaceId 的固定键。
 * 核心侧边栏「未分组」桶头的键值是空串（core ui-workspace `UNGROUPED_KEY = ''`，
 * Rows.tsx dragstart 写 row.key），宽容裁决把它与未归组会话一并映射到此键。
 * 品牌经宿主同款惯例的一次显式断言获得（运行时即普通字符串）。
 */
export const UNGROUPED_WORKSPACE_ID = '__ungrouped__' as WorkspaceId

/** 「未分组」分组的固定标题。 */
export const UNGROUPED_GROUP_TITLE = '未分组'

// ── State ──────────────────────────────────────────────

export interface DrawerEntry {
  readonly sessionId: SessionId
  readonly title: string
}

export interface DrawerGroup {
  readonly workspaceId: WorkspaceId
  readonly title: string
  readonly collapsed: boolean
  readonly entries: readonly DrawerEntry[]
}

export interface DrawerState {
  readonly groups: readonly DrawerGroup[]
  readonly open: boolean
  readonly searchQuery: string
}

// ── Actions ────────────────────────────────────────────

export interface DrawerActions {
  /**
   * Actions are pure: they inspect the (read-only) current state and either
   * return a NEW state that replaces it wholesale, or return nothing to keep
   * the incoming draft. The persistent store wrapper still persists and
   * notifies on every call, so external semantics are unchanged.
   */

  /** Toggle drawer open/closed. Closing also clears search. */
  toggle: (draft: DrawerState) => DrawerState | void
  /** Open the drawer. */
  openDrawer: (draft: DrawerState) => DrawerState | void
  /** Close the drawer and clear search. */
  closeDrawer: (draft: DrawerState) => DrawerState | void
  /** Add a workspace group. If exists, do nothing. */
  addGroup: (draft: DrawerState, workspaceId: WorkspaceId, title: string) => DrawerState | void
  /** Add a workspace group with initial entries in a single update (batch). */
  addGroupWithEntries: (draft: DrawerState, workspaceId: WorkspaceId, title: string, entries: readonly DrawerEntry[]) => DrawerState | void
  /** Add a session entry to a group. Auto-creates group if needed. Deduplicates. */
  addEntry: (draft: DrawerState, workspaceId: WorkspaceId, workspaceTitle: string, sessionId: SessionId, sessionTitle: string) => DrawerState | void
  /** Remove a session entry. Removes group if empty afterward. */
  removeEntry: (draft: DrawerState, workspaceId: WorkspaceId, sessionId: SessionId) => DrawerState | void
  /** Remove a group and all its entries. */
  removeGroup: (draft: DrawerState, workspaceId: WorkspaceId) => DrawerState | void
  /** Toggle a group's collapsed state. */
  toggleGroup: (draft: DrawerState, workspaceId: WorkspaceId) => DrawerState | void
  /** Set search query. */
  setSearch: (draft: DrawerState, query: string) => DrawerState | void
  /** Reorder entries within a group. */
  reorderEntries: (draft: DrawerState, workspaceId: WorkspaceId, fromIndex: number, toIndex: number) => DrawerState | void
  /** Reorder groups. */
  reorderGroups: (draft: DrawerState, fromIndex: number, toIndex: number) => DrawerState | void
}

// ── Helpers ────────────────────────────────────────────

function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const result = [...arr]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}

// ── Store factory ──────────────────────────────────────

export function createDrawerStore() {
  return {
    init: (): DrawerState => ({
      groups: [],
      open: false,
      searchQuery: '',
    }),

    persist: 'dsh.drawer',

    actions: {
      toggle(draft: DrawerState) {
        if (draft.open) return { ...draft, open: false, searchQuery: '' }
        return { ...draft, open: true }
      },

      openDrawer(draft: DrawerState) {
        return { ...draft, open: true }
      },

      closeDrawer(draft: DrawerState) {
        return { ...draft, open: false, searchQuery: '' }
      },

      addGroup(draft: DrawerState, workspaceId: WorkspaceId, title: string) {
        if (draft.groups.some(g => g.workspaceId === workspaceId)) return
        return { ...draft, groups: [...draft.groups, { workspaceId, title, collapsed: false, entries: [] }] }
      },

      addGroupWithEntries(draft: DrawerState, workspaceId: WorkspaceId, title: string, entries: readonly DrawerEntry[]) {
        if (draft.groups.some(g => g.workspaceId === workspaceId)) return
        // Deduplicate entries by sessionId.
        const seen = new Set<SessionId>()
        const unique: DrawerEntry[] = []
        for (const e of entries) {
          if (!seen.has(e.sessionId)) {
            seen.add(e.sessionId)
            unique.push(e)
          }
        }
        return { ...draft, groups: [...draft.groups, { workspaceId, title, collapsed: false, entries: unique }] }
      },

      addEntry(draft: DrawerState, workspaceId: WorkspaceId, workspaceTitle: string, sessionId: SessionId, sessionTitle: string) {
        // Deduplicate across all groups.
        if (draft.groups.some(g => g.entries.some(e => e.sessionId === sessionId))) return

        // Find or create group — on a local mutable copy, then replace wholesale.
        const groups = [...draft.groups]
        let gIdx = groups.findIndex(g => g.workspaceId === workspaceId)
        if (gIdx === -1) {
          groups.push({ workspaceId, title: workspaceTitle, collapsed: false, entries: [] })
          gIdx = groups.length - 1
        }

        const group = groups[gIdx]
        groups[gIdx] = { ...group, entries: [...group.entries, { sessionId, title: sessionTitle }] }
        return { ...draft, groups }
      },

      removeEntry(draft: DrawerState, workspaceId: WorkspaceId, sessionId: SessionId) {
        const gIdx = draft.groups.findIndex(g => g.workspaceId === workspaceId)
        if (gIdx === -1) return
        const group = draft.groups[gIdx]
        const newEntries = group.entries.filter(e => e.sessionId !== sessionId)
        if (newEntries.length === 0) {
          // Remove empty group.
          return { ...draft, groups: draft.groups.filter((_, i) => i !== gIdx) }
        }
        return { ...draft, groups: draft.groups.map((g, i) => i === gIdx ? { ...g, entries: newEntries } : g) }
      },

      removeGroup(draft: DrawerState, workspaceId: WorkspaceId) {
        return { ...draft, groups: draft.groups.filter(g => g.workspaceId !== workspaceId) }
      },

      toggleGroup(draft: DrawerState, workspaceId: WorkspaceId) {
        const gIdx = draft.groups.findIndex(g => g.workspaceId === workspaceId)
        if (gIdx === -1) return
        return { ...draft, groups: draft.groups.map((g, i) => i === gIdx ? { ...g, collapsed: !g.collapsed } : g) }
      },

      setSearch(draft: DrawerState, query: string) {
        return { ...draft, searchQuery: query }
      },

      reorderEntries(draft: DrawerState, workspaceId: WorkspaceId, fromIndex: number, toIndex: number) {
        const gIdx = draft.groups.findIndex(g => g.workspaceId === workspaceId)
        if (gIdx === -1) return
        return {
          ...draft,
          groups: draft.groups.map((g, i) => i === gIdx ? { ...g, entries: moveItem(g.entries, fromIndex, toIndex) } : g),
        }
      },

      reorderGroups(draft: DrawerState, fromIndex: number, toIndex: number) {
        return { ...draft, groups: moveItem(draft.groups, fromIndex, toIndex) }
      },
    } satisfies DrawerActions,
  }
}
