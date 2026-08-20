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
  /** Toggle drawer open/closed. */
  toggle: (draft: DrawerState) => void
  /** Open the drawer. */
  openDrawer: (draft: DrawerState) => void
  /** Close the drawer and clear search. */
  closeDrawer: (draft: DrawerState) => void
  /** Add a workspace group. If exists, do nothing. */
  addGroup: (draft: DrawerState, workspaceId: WorkspaceId, title: string) => void
  /** Add a workspace group with initial entries in a single update (batch). */
  addGroupWithEntries: (draft: DrawerState, workspaceId: WorkspaceId, title: string, entries: readonly DrawerEntry[]) => void
  /** Add a session entry to a group. Auto-creates group if needed. Deduplicates. */
  addEntry: (draft: DrawerState, workspaceId: WorkspaceId, workspaceTitle: string, sessionId: SessionId, sessionTitle: string) => void
  /** Remove a session entry. Removes group if empty afterward. */
  removeEntry: (draft: DrawerState, workspaceId: WorkspaceId, sessionId: SessionId) => void
  /** Remove a group and all its entries. */
  removeGroup: (draft: DrawerState, workspaceId: WorkspaceId) => void
  /** Toggle a group's collapsed state. */
  toggleGroup: (draft: DrawerState, workspaceId: WorkspaceId) => void
  /** Set search query. */
  setSearch: (draft: DrawerState, query: string) => void
  /** Reorder entries within a group. */
  reorderEntries: (draft: DrawerState, workspaceId: WorkspaceId, fromIndex: number, toIndex: number) => void
  /** Reorder groups. */
  reorderGroups: (draft: DrawerState, fromIndex: number, toIndex: number) => void
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
        draft.open = !draft.open
        if (!draft.open) draft.searchQuery = ''
      },

      openDrawer(draft: DrawerState) {
        draft.open = true
      },

      closeDrawer(draft: DrawerState) {
        draft.open = false
        draft.searchQuery = ''
      },

      addGroup(draft: DrawerState, workspaceId: WorkspaceId, title: string) {
        if (draft.groups.some(g => g.workspaceId === workspaceId)) return
        draft.groups = [...draft.groups, { workspaceId, title, collapsed: false, entries: [] }]
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
        draft.groups = [...draft.groups, { workspaceId, title, collapsed: false, entries: unique }]
      },

      addEntry(draft: DrawerState, workspaceId: WorkspaceId, workspaceTitle: string, sessionId: SessionId, sessionTitle: string) {
        // Deduplicate across all groups.
        for (const g of draft.groups) {
          if (g.entries.some(e => e.sessionId === sessionId)) return
        }

        // Find or create group.
        let gIdx = draft.groups.findIndex(g => g.workspaceId === workspaceId)
        if (gIdx === -1) {
          draft.groups = [...draft.groups, { workspaceId, title: workspaceTitle, collapsed: false, entries: [] }]
          gIdx = draft.groups.length - 1
        }

        const group = draft.groups[gIdx]
        const newEntry: DrawerEntry = { sessionId, title: sessionTitle }
        const updated: DrawerGroup = { ...group, entries: [...group.entries, newEntry] }
        draft.groups = draft.groups.map((g, i) => i === gIdx ? updated : g)
      },

      removeEntry(draft: DrawerState, workspaceId: WorkspaceId, sessionId: SessionId) {
        const gIdx = draft.groups.findIndex(g => g.workspaceId === workspaceId)
        if (gIdx === -1) return
        const group = draft.groups[gIdx]
        const newEntries = group.entries.filter(e => e.sessionId !== sessionId)
        if (newEntries.length === 0) {
          // Remove empty group.
          draft.groups = draft.groups.filter((_, i) => i !== gIdx)
        } else {
          const updated: DrawerGroup = { ...group, entries: newEntries }
          draft.groups = draft.groups.map((g, i) => i === gIdx ? updated : g)
        }
      },

      removeGroup(draft: DrawerState, workspaceId: WorkspaceId) {
        draft.groups = draft.groups.filter(g => g.workspaceId !== workspaceId)
      },

      toggleGroup(draft: DrawerState, workspaceId: WorkspaceId) {
        const gIdx = draft.groups.findIndex(g => g.workspaceId === workspaceId)
        if (gIdx === -1) return
        const group = draft.groups[gIdx]
        const updated: DrawerGroup = { ...group, collapsed: !group.collapsed }
        draft.groups = draft.groups.map((g, i) => i === gIdx ? updated : g)
      },

      setSearch(draft: DrawerState, query: string) {
        draft.searchQuery = query
      },

      reorderEntries(draft: DrawerState, workspaceId: WorkspaceId, fromIndex: number, toIndex: number) {
        const gIdx = draft.groups.findIndex(g => g.workspaceId === workspaceId)
        if (gIdx === -1) return
        const group = draft.groups[gIdx]
        const updated: DrawerGroup = { ...group, entries: moveItem(group.entries, fromIndex, toIndex) }
        draft.groups = draft.groups.map((g, i) => i === gIdx ? updated : g)
      },

      reorderGroups(draft: DrawerState, fromIndex: number, toIndex: number) {
        draft.groups = moveItem(draft.groups, fromIndex, toIndex)
      },
    } satisfies DrawerActions,
  }
}
