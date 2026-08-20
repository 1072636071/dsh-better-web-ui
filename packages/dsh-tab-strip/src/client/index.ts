/**
 * Client entry for the DSH session-drawer plugin.
 *
 * Registers into the `shell.overlay` slot (existing list/root scope),
 * renders a slide-out drawer panel for managing session/workspace entries.
 * Pure plugin — no core package modifications required.
 */

import { useEffect, useMemo, useState } from 'react'
import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import { createDrawerStore, type DrawerState, type DrawerEntry } from './drawer-store.ts'
import { SessionDrawer } from './SessionDrawer.tsx'

// ── Cordis services this plugin needs ────────────────

export const inject = ['slots', 'sessions', 'workspaces']

// ── Persistent observable store wrapper ──────────────
// Wraps the drawer store spec with localStorage persistence.
// In production DSH builds, this would be replaced by defineStore({ persist })
// from the runtime for automatic rehydration + write-through via zustand + immer.
// This implementation matches the same contract: reads on init, writes on every change.

function createPersistentStore<T>(spec: {
  init: () => T
  persist?: string
  actions: Record<string, (draft: T, ...args: any[]) => void>
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
  function update(updater: (draft: T) => void) {
    const draft = structuredClone(state) as T
    updater(draft)
    state = draft
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

interface DrawerWrapperProps {
  store: ReturnType<typeof createPersistentStore<DrawerState>>
  sessions: any
  workspaces: any
}

function DrawerWrapper({ store, sessions, workspaces }: DrawerWrapperProps) {
  const state = useStore(store)

  // Read live workspace names from workspaces service.
  const workspaceNames = useMemo(() => {
    const names: Record<string, string> = {}
    try {
      const snapshot = workspaces.list?.getSnapshot?.()
      if (snapshot?.items) {
        for (const ws of snapshot.items) {
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
  const workspaceSessionEntries = useMemo(() => {
    const map: Record<string, DrawerEntry[]> = {}
    try {
      const wsSnapshot = workspaces.list?.getSnapshot?.()
      const sessSnapshot = sessions.list?.getSnapshot?.()
      if (wsSnapshot?.items && sessSnapshot?.byId) {
        for (const ws of wsSnapshot.items) {
          map[ws.workspaceId] = (ws.sessionIds ?? []).map((sid: string) => {
            const info = sessSnapshot.byId[sid] as any
            return { sessionId: sid as SessionId, title: info?.title ?? info?.name ?? sid }
          })
        }
      }
    } catch { /* ignore */ }
    return map
  }, [workspaces, sessions])

  const boundActions = useMemo(() => ({
    toggle: () => store.actions.toggle(),
    closeDrawer: () => store.actions.closeDrawer(),
    addEntry: (wsId: WorkspaceId, wsTitle: string, sessId: SessionId, sessTitle: string) =>
      store.actions.addEntry(wsId, wsTitle, sessId, sessTitle),
    /** Add a workspace group AND populate it with the workspace's existing sessions (single batch update). */
    addGroupWithSessions: (wsId: WorkspaceId, title: string) => {
      const entries = workspaceSessionEntries[wsId] ?? []
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
  }), [store, sessions, workspaceSessionEntries])

  return SessionDrawer({ state, actions: boundActions, workspaceNames, sessionNames })
}

// ── Entry point ───────────────────────────────────────

export function apply(ctx: any): void {
  const sessions = ctx.sessions
  const workspaces = ctx.workspaces

  // Create the persistent store (singleton per plugin fiber).
  const store = createPersistentStore(createDrawerStore())

  // Register into shell.overlay (existing list/root slot).
  ctx.effect(
    () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'session-drawer',
      order: 100,
    }, function SessionDrawerEntry() {
      return DrawerWrapper({ store, sessions, workspaces })
    }),
    'session-drawer: overlay registration',
  )
}
