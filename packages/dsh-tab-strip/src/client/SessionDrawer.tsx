/**
 * SessionDrawer — slide-out drawer panel for session/workspace management.
 *
 * Implements tickets 01-05:
 * - Trigger button + backdrop + slide-in panel (01)
 * - Drop zone for sidebar drag + dedup highlight (02)
 * - Click entry → switch session + close drawer (03)
 * - × close button + cascade group removal (03)
 * - Search filter with real-time matching (04)
 * - Entry drag reorder within drawer (05)
 * - Ctrl+Shift+T toggle + Esc close (05)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import clsx from 'clsx'
import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { DrawerState, DrawerGroup, DrawerEntry } from './drawer-store.ts'
import css from './SessionDrawer.module.css'

// ── Types ──────────────────────────────────────────────

export interface SessionDrawerProps {
  state: DrawerState
  actions: {
    toggle: () => void
    closeDrawer: () => void
    addEntry: (workspaceId: WorkspaceId, workspaceTitle: string, sessionId: SessionId, sessionTitle: string) => void
    addGroupWithSessions: (workspaceId: WorkspaceId, title: string) => void
    removeEntry: (workspaceId: WorkspaceId, sessionId: SessionId) => void
    removeGroup: (workspaceId: WorkspaceId) => void
    toggleGroup: (workspaceId: WorkspaceId) => void
    setSearch: (query: string) => void
    reorderEntries: (workspaceId: WorkspaceId, fromIndex: number, toIndex: number) => void
    reorderGroups: (fromIndex: number, toIndex: number) => void
    openSession: (sessionId: SessionId) => void
  }
  /** Workspace display names keyed by workspaceId (live from workspaces service). */
  workspaceNames: Record<string, string>
  /** Session display names keyed by sessionId (live from sessions service). */
  sessionNames: Record<string, string>
}

// ── Drag data transfer format ────────────────────────

/** Custom MIME type for DSH drag data. */
const DSH_DRAG_MIME = 'application/x-dsh-drag'

interface DshDragData {
  kind: 'session' | 'workspace'
  id: string
  workspaceId?: string  // for session drags, the parent workspace
  title?: string
}

function parseDragData(e: React.DragEvent): DshDragData | null {
  // Try custom MIME first.
  const custom = e.dataTransfer.getData(DSH_DRAG_MIME)
  if (custom) {
    try { return JSON.parse(custom) as DshDragData } catch { /* fall through */ }
  }
  // Fallback: text/plain with structured format "kind:id:workspaceId".
  const text = e.dataTransfer.getData('text/plain')
  if (!text) return null
  const parts = text.split(':')
  if (parts.length >= 2 && (parts[0] === 'session' || parts[0] === 'workspace')) {
    return { kind: parts[0], id: parts[1], workspaceId: parts[2] || undefined }
  }
  return null
}

// ── Helpers ────────────────────────────────────────────

function filterGroups(
  groups: readonly DrawerGroup[],
  query: string,
  sessionNames: Record<string, string>,
): DrawerGroup[] {
  if (!query.trim()) return [...groups]
  const lower = query.toLowerCase()
  return groups
    .map(g => {
      const filteredEntries = g.entries.filter(e => {
        const liveName = sessionNames[e.sessionId] ?? e.title
        return liveName.toLowerCase().includes(lower)
      })
      // Group is kept only if it has matching entries.
      return { ...g, entries: filteredEntries }
    })
    .filter(g => g.entries.length > 0)
}

// ── Component ──────────────────────────────────────────

export function SessionDrawer({ state, actions, workspaceNames, sessionNames }: SessionDrawerProps) {
  const { open, groups, searchQuery } = state
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Drop zone state (ticket 02) ──
  const [dragOver, setDragOver] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // ── Drag reorder state (ticket 05) ──
  const [dragIndex, setDragIndex] = useState<{ groupWsId: WorkspaceId; entryIdx: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ groupWsId: WorkspaceId; entryIdx: number } | null>(null)

  // ── Auto-focus search on open ──
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  // ── Esc to close ──
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actions.closeDrawer()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, actions])

  // ── Ctrl+Shift+T to toggle ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        actions.toggle()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [actions])

  // ── Highlight flash auto-clear ──
  useEffect(() => {
    if (highlightId === null) return
    const timer = setTimeout(() => setHighlightId(null), 1200)
    return () => clearTimeout(timer)
  }, [highlightId])

  // ── Filtered groups (ticket 04) ──
  const filteredGroups = useMemo(
    () => filterGroups(groups, searchQuery, sessionNames),
    [groups, searchQuery, sessionNames],
  )

  // ── Drop handlers (ticket 02) ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only handle leave if actually leaving the panel.
    if (!panelRef.current?.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const data = parseDragData(e)
    if (!data) return

    if (data.kind === 'session') {
      const wsId = (data.workspaceId ?? '') as WorkspaceId
      const wsTitle = workspaceNames[wsId] ?? wsId
      const sessId = data.id as SessionId
      const sessTitle = data.title ?? sessionNames[sessId] ?? sessId

      // Dedup check: if already exists, highlight instead.
      const exists = groups.some(g => g.entries.some(en => en.sessionId === sessId))
      if (exists) {
        setHighlightId(sessId)
        return
      }

      actions.addEntry(wsId, wsTitle, sessId, sessTitle)
    } else if (data.kind === 'workspace') {
      const wsId = data.id as WorkspaceId
      const wsTitle = data.title ?? workspaceNames[wsId] ?? wsId

      const exists = groups.some(g => g.workspaceId === wsId)
      if (exists) {
        setHighlightId(wsId)
        return
      }

      actions.addGroupWithSessions(wsId, wsTitle)
    }
  }, [actions, groups, workspaceNames, sessionNames])

  // ── Entry click → switch + close (ticket 03) ──
  const handleEntryClick = useCallback((sessionId: SessionId) => {
    actions.openSession(sessionId)
    actions.closeDrawer()
  }, [actions])

  // ── Entry close (ticket 03) ──
  const handleEntryClose = useCallback((e: React.MouseEvent, workspaceId: WorkspaceId, sessionId: SessionId) => {
    e.stopPropagation()
    actions.removeEntry(workspaceId, sessionId)
  }, [actions])

  // ── Group close — cascade (ticket 03) ──
  const handleGroupClose = useCallback((e: React.MouseEvent, workspaceId: WorkspaceId) => {
    e.stopPropagation()
    actions.removeGroup(workspaceId)
  }, [actions])

  // ── Group toggle collapse ──
  const handleGroupToggle = useCallback((workspaceId: WorkspaceId) => {
    actions.toggleGroup(workspaceId)
  }, [actions])

  // ── Entry drag reorder handlers (ticket 05) ──
  const handleEntryDragStart = useCallback((e: React.DragEvent, groupWsId: WorkspaceId, entryIdx: number) => {
    setDragIndex({ groupWsId, entryIdx })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `reorder:${groupWsId}:${entryIdx}`)
  }, [])

  const handleEntryDragOver = useCallback((e: React.DragEvent, groupWsId: WorkspaceId, entryIdx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ groupWsId, entryIdx })
  }, [])

  const handleEntryDrop = useCallback((e: React.DragEvent, targetWsId: WorkspaceId, targetIdx: number) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)

    if (!dragIndex) return
    // Only reorder within the same group.
    if (dragIndex.groupWsId !== targetWsId) {
      setDragIndex(null)
      return
    }
    if (dragIndex.entryIdx !== targetIdx) {
      actions.reorderEntries(targetWsId, dragIndex.entryIdx, targetIdx)
    }
    setDragIndex(null)
  }, [dragIndex, actions])

  const handleEntryDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropTarget(null)
  }, [])

  // ── Render ──

  return (
    <>
      {/* Trigger button — always rendered */}
      <button
        className={css.trigger}
        onClick={actions.toggle}
        title="Session Drawer (Ctrl+Shift+T)"
        aria-label="Open session drawer"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="3" width="14" height="3" rx="1" fill="currentColor" />
          <rect x="2" y="8" width="10" height="2" rx="1" fill="currentColor" opacity="0.6" />
          <rect x="2" y="12" width="12" height="2" rx="1" fill="currentColor" opacity="0.4" />
        </svg>
        {groups.length > 0 && (
          <span className={css.badge}>{groups.reduce((sum, g) => sum + g.entries.length, 0)}</span>
        )}
      </button>

      {/* Drawer panel + backdrop */}
      {open && (
        <div className={css.overlay}>
          <div className={css.backdrop} onClick={actions.closeDrawer} />
          <div
            ref={panelRef}
            className={clsx(css.panel, dragOver && css.panelDragOver)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Search bar (ticket 04) */}
            <div className={css.searchBar}>
              <input
                ref={searchRef}
                className={css.searchInput}
                type="text"
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => actions.setSearch(e.target.value)}
              />
            </div>

            {/* Entry list */}
            <div className={css.entryList}>
              {filteredGroups.length === 0 && (
                <div className={css.emptyState}>
                  {groups.length === 0
                    ? 'Drag sessions or workspaces from the sidebar into this drawer.'
                    : 'No matching sessions found.'}
                </div>
              )}

              {filteredGroups.map(group => (
                <div
                  key={group.workspaceId}
                  className={clsx(css.group, highlightId === group.workspaceId && css.highlightFlash)}
                >
                  <div
                    className={css.groupHeader}
                    onClick={() => handleGroupToggle(group.workspaceId)}
                  >
                    <span className={clsx(css.groupArrow, group.collapsed && css.groupArrowCollapsed)}>
                      ▸
                    </span>
                    <span className={css.groupTitle}>
                      {/* Use live name from service, fallback to stored title */}
                      {workspaceNames[group.workspaceId] ?? group.title}
                    </span>
                    <span className={css.groupCount}>{group.entries.length}</span>
                    <span
                      className={css.closeBtn}
                      onClick={(e) => handleGroupClose(e, group.workspaceId)}
                      role="button"
                      aria-label={`Remove workspace ${workspaceNames[group.workspaceId] ?? group.title}`}
                    >
                      ×
                    </span>
                  </div>

                  {!group.collapsed && (
                    <div className={css.groupEntries}>
                      {group.entries.map((entry, idx) => (
                        <div
                          key={entry.sessionId}
                          draggable
                          onDragStart={(e) => handleEntryDragStart(e, group.workspaceId, idx)}
                          onDragOver={(e) => handleEntryDragOver(e, group.workspaceId, idx)}
                          onDrop={(e) => handleEntryDrop(e, group.workspaceId, idx)}
                          onDragEnd={handleEntryDragEnd}
                          className={clsx(
                            css.entry,
                            highlightId === entry.sessionId && css.highlightFlash,
                            dragIndex?.groupWsId === group.workspaceId && dragIndex.entryIdx === idx && css.entryDragging,
                            dropTarget?.groupWsId === group.workspaceId && dropTarget.entryIdx === idx && css.entryDropTarget,
                          )}
                          onClick={() => handleEntryClick(entry.sessionId)}
                        >
                          <span className={css.dragHandle} aria-hidden="true">⠿</span>
                          <span className={css.entryTitle}>
                            {/* Use live name from service, fallback to stored title */}
                            {sessionNames[entry.sessionId] ?? entry.title}
                          </span>
                          <span
                            className={css.closeBtn}
                            onClick={(e) => handleEntryClose(e, group.workspaceId, entry.sessionId)}
                            role="button"
                            aria-label={`Remove session ${sessionNames[entry.sessionId] ?? entry.title}`}
                          >
                            ×
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Drop zone hint when dragging over */}
            {dragOver && groups.length === 0 && (
              <div className={css.dropHint}>Drop here to add</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
