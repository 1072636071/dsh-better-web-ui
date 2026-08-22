/**
 * Client entry for the DSH session-drawer plugin.
 *
 * Registers into the `shell.overlay` slot (existing list/root scope),
 * renders a slide-out drawer panel for managing session/workspace entries.
 * Pure plugin — no core package modifications required.
 */

import { useEffect, useMemo, useState } from 'react'
import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import { createDrawerStore, UNGROUPED_WORKSPACE_ID, type DrawerState, type DrawerEntry } from './drawer-store.ts'
import { readWorkspaceSummaries, SessionDrawer } from './SessionDrawer.tsx'

// ── Cordis services this plugin needs ────────────────

export const inject = ['slots', 'sessions', 'workspaces']

// ── Persistent observable store wrapper ──────────────
// Wraps the drawer store spec with localStorage persistence.
// In production DSH builds, this would be replaced by defineStore({ persist })
// from the runtime for automatic rehydration + write-through via zustand + immer.
// This implementation matches the same contract: reads on init, writes on every change.

// Exported for the seam smoke tests (issue 01): tests build the same store
// wiring that apply() uses. Existing function — no new seam introduced.
export function createPersistentStore<T>(spec: {
  init: () => T
  persist?: string
  actions: Record<string, (draft: T, ...args: any[]) => T | void>
}) {
  // Rehydrate from localStorage.
  let state: T = spec.init()
  if (spec.persist) {
    try {
      const raw = localStorage.getItem(spec.persist)
      if (raw) {
        const parsed = JSON.parse(raw) as T
        // Basic validation: ensure parsed value is an object.
        if (parsed && typeof parsed === 'object') {
          state = parsed
        }
      }
    } catch {
      // Corrupted data — start fresh.
      try { localStorage.removeItem(spec.persist) } catch { /* private mode */ }
    }
  }

  const listeners = new Set<() => void>()
  const persistKey = spec.persist

  function getState(): T { return state }
  function subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }
  // Actions either return a new state to replace the draft wholesale, or
  // nothing to keep it; persistence + notification happen on every call.
  function update(updater: (draft: T) => T | void) {
    const draft = structuredClone(state) as T
    const next = updater(draft)
    state = (typeof next === 'undefined' ? draft : next) as T
    // Write-through to localStorage.
    if (persistKey) {
      try { localStorage.setItem(persistKey, JSON.stringify(state)) } catch { /* quota/private */ }
    }
    listeners.forEach(fn => fn())
  }

  const actions: Record<string, (...args: any[]) => void> = {}
  for (const [key, fn] of Object.entries(spec.actions)) {
    actions[key] = (...args: any[]) => update((d: T) => fn(d, ...args))
  }

  return { getState, subscribe, actions }
}

/** React hook to subscribe to the persistent store. */
function useStore<T>(store: { getState: () => T; subscribe: (fn: () => void) => () => void }): T {
  const [snapshot, setSnapshot] = useState(store.getState)
  useEffect(() => {
    const unsub = store.subscribe(() => setSnapshot(store.getState()))
    setSnapshot(store.getState())
    return unsub
  }, [store])
  return snapshot
}

// ── Wrapper component ────────────────────────────────

/**
 * Read a workspace's current session entries straight from the service
 * snapshots — called at drop time so batch filling always uses the
 * authoritative view, never a render-stale one.
 */
function collectWorkspaceEntries(sessions: any, workspaces: any, workspaceId: WorkspaceId): DrawerEntry[] {
  const entries: DrawerEntry[] = []
  try {
    const wsSnap = workspaces?.list?.getSnapshot?.()
    const sessSnap = sessions?.list?.getSnapshot?.()
    const ws = readWorkspaceSummaries(wsSnap).find((w: any) => w.workspaceId === workspaceId)
    for (const sid of ws?.sessionIds ?? []) {
      const info = sessSnap?.byId?.[sid] as any
      entries.push({ sessionId: sid as SessionId, title: info?.title ?? info?.name ?? sid })
    }
  } catch { /* service may not be available */ }
  return entries
}

/**
 * Collect every snapshot session NOT claimed by any real workspace's
 * sessionIds — the membership of the sentinel「未分组」group when the sidebar's
 * ungrouped bucket head is dropped in.
 */
function collectUngroupedEntries(sessions: any, workspaces: any): DrawerEntry[] {
  try {
    const grouped = new Set<string>()
    const wsSnap = workspaces?.list?.getSnapshot?.()
    for (const ws of readWorkspaceSummaries(wsSnap)) {
      for (const sid of ws.sessionIds ?? []) grouped.add(sid)
    }
    const sessSnap = sessions?.list?.getSnapshot?.()
    return Object.entries(sessSnap?.byId ?? {})
      .filter(([sid]) => !grouped.has(sid))
      .map(([sid, info]) => {
        const i = info as any
        return { sessionId: sid as SessionId, title: i?.title ?? i?.name ?? sid }
      })
  } catch { /* service may not be available */ return [] }
}

interface DrawerWrapperProps {
  store: ReturnType<typeof createPersistentStore<DrawerState>>
  sessions: any
  workspaces: any
}

// Exported for the seam smoke tests: the single test boundary is
// "fake services + real store + this real wrapper". Existing function — no
// new seam introduced.
export function DrawerWrapper({ store, sessions, workspaces }: DrawerWrapperProps) {
  const state = useStore(store)

  // Read live workspace names from workspaces service.
  const workspaceNames = useMemo(() => {
    const names: Record<string, string> = {}
    try {
      const snapshot = workspaces.list?.getSnapshot?.()
      for (const ws of readWorkspaceSummaries(snapshot)) {
        if (ws.workspaceId != null) {
          names[ws.workspaceId] = ws.title ?? ws.workspaceId
        }
      }
    } catch { /* service may not be available */ }
    return names
  }, [workspaces])

  // Read live session names from sessions service.
  const sessionNames = useMemo(() => {
    const names: Record<string, string> = {}
    try {
      const snapshot = sessions.list?.getSnapshot?.()
      if (snapshot?.byId) {
        for (const [id, info] of Object.entries(snapshot.byId)) {
          const i = info as any
          names[id] = i?.title ?? i?.name ?? id
        }
      }
    } catch { /* service may not be available */ }
    return names
  }, [sessions])

  // Build a lookup: workspaceId → session entries (for drag-workspace population).
  const boundActions = useMemo(() => ({
    toggle: () => store.actions.toggle(),
    closeDrawer: () => store.actions.closeDrawer(),
    addEntry: (wsId: WorkspaceId, wsTitle: string, sessId: SessionId, sessTitle: string) =>
      store.actions.addEntry(wsId, wsTitle, sessId, sessTitle),
    /** Add a workspace group AND populate it with the workspace's existing sessions (single batch update).
     *  The sentinel「未分组」key routes to the ungrouped membership instead. */
    addGroupWithSessions: (wsId: WorkspaceId, title: string) => {
      const entries = wsId === UNGROUPED_WORKSPACE_ID
        ? collectUngroupedEntries(sessions, workspaces)
        : collectWorkspaceEntries(sessions, workspaces, wsId)
      store.actions.addGroupWithEntries(wsId, title, entries)
    },
    removeEntry: (wsId: WorkspaceId, sessId: SessionId) =>
      store.actions.removeEntry(wsId, sessId),
    removeGroup: (wsId: WorkspaceId) =>
      store.actions.removeGroup(wsId),
    toggleGroup: (wsId: WorkspaceId) =>
      store.actions.toggleGroup(wsId),
    setSearch: (q: string) =>
      store.actions.setSearch(q),
    reorderEntries: (wsId: WorkspaceId, from: number, to: number) =>
      store.actions.reorderEntries(wsId, from, to),
    reorderGroups: (from: number, to: number) =>
      store.actions.reorderGroups(from, to),
    openSession: (sessionId: SessionId) => { sessions.open(sessionId) },
  }), [store, sessions, workspaces])

  // Pass the raw services through: the drawer's tier-3 tolerant adjudication
  // reads fresh snapshots from them at drop time (ADR-003).
  return SessionDrawer({ state, actions: boundActions, workspaceNames, sessionNames, services: { sessions, workspaces } })
}

// ── Entry point ───────────────────────────────────────

export function apply(ctx: any): void {
  const sessions = ctx.sessions
  const workspaces = ctx.workspaces

  // Create the persistent store (singleton per plugin fiber).
  const store = createPersistentStore(createDrawerStore())

  // Register into shell.overlay (list slot declared by ui-layout's AppFrame).
  // Two-phase pattern (same as dsh-better-sidebar / the slot-catalog example):
  // slots.inject waits for the slot declaration to exist, THEN registers our
  // entry. A bare register() throws "undeclared target" when it runs before
  // ui-layout applied, failing the plugin fiber silently. The injection
  // controller installs through this caller's fiber, so plugin unload
  // disposes the registration.
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'session-drawer',
      order: 100,
    }, function SessionDrawerEntry() {
      return DrawerWrapper({ store, sessions, workspaces })
    }),
  )
}
