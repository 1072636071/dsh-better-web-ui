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
import { UNGROUPED_WORKSPACE_ID, UNGROUPED_GROUP_TITLE } from './drawer-store.ts'
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
  /**
   * Raw cordis services, used ONLY by the tier-3 tolerant bare-id
   * adjudication (ADR-003): identity is decided against fresh
   * sessions/workspaces snapshots at drop time — never against core DOM.
   */
  services?: {
    sessions?: any
    workspaces?: any
  }
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

/**
 * Tiers 1–2 of the drop resolution chain (PRD 实现决策 4):
 * canonical `application/x-dsh-drag` JSON first, then prefixed text/plain.
 * When neither hits, the raw text/plain is returned as `bareText` so tier 3
 * (tolerant adjudication against service snapshots) can take over.
 */
function parseDragPayload(e: React.DragEvent): { data: DshDragData | null; bareText: string } {
  // Tier 1: canonical MIME (JSON).
  const custom = e.dataTransfer.getData(DSH_DRAG_MIME)
  if (custom) {
    try { return { data: JSON.parse(custom) as DshDragData, bareText: '' } } catch { /* fall through */ }
  }
  // Tier 2: text/plain with structured format "kind:id:workspaceId".
  const text = e.dataTransfer.getData('text/plain')
  if (text) {
    const parts = text.split(':')
    if (parts.length >= 2 && (parts[0] === 'session' || parts[0] === 'workspace')) {
      return { data: { kind: parts[0], id: parts[1], workspaceId: parts[2] || undefined }, bareText: '' }
    }
  }
  // No protocol hit — hand the raw text to tier 3.
  return { data: null, bareText: text }
}

/**
 * 服务快照的目录摘要统一读取：兼容 items 数组与 byId 映射双形状
 * （与宿主快照形状演进解耦）。同 workspaceId 以先出现的 items 项为准。
 * 裁决与装配层的所有 workspaces 快照消费都应经由本函数。
 */
export function readWorkspaceSummaries(snapshot: any): any[] {
  if (!snapshot || typeof snapshot !== 'object') return []
  const summaries: any[] = [...(Array.isArray(snapshot.items) ? snapshot.items : [])]
  const seen = new Set(summaries.map((w: any) => w?.workspaceId))
  const byId = snapshot.byId
  if (byId && typeof byId === 'object') {
    for (const [key, value] of Object.entries(byId)) {
      const w = value as any
      const wsId = w?.workspaceId ?? key
      if (!seen.has(wsId)) {
        seen.add(wsId)
        summaries.push({ ...w, workspaceId: wsId })
      }
    }
  }
  return summaries
}

/** What tolerant adjudication decided a bare id to be. */
type BareAdjudication =
  | { kind: 'session'; sessionId: SessionId; /** Real parent workspace; null = ungrouped (PRD 决策6). */ workspaceId: WorkspaceId | null; title: string }
  | { kind: 'workspace'; workspaceId: WorkspaceId; title: string }
  | { kind: 'ungrouped-bucket' }

/**
 * Tier 3 — 宽容解析（ADR-003）：把裸 id 交给 sessions/workspaces 服务快照裁决。
 * 服务快照是身份与归属的唯一权威；不依赖核心包 DOM 结构或样式类名。
 * 会话归属由 workspaces 快照各目录的 sessionIds 反查得出。
 */
function adjudicateBareId(id: string, services?: SessionDrawerProps['services']): BareAdjudication | null {
  // 核心侧边栏「未分组」桶头的键值是空串（core ui-workspace UNGROUPED_KEY = ''，
  // Rows.tsx dragstart 写 row.key）——按未归组信号处理（PRD 决策6）。
  if (id === '') return { kind: 'ungrouped-bucket' }
  // 防御兜底（当前调用链不可达：id 恒为字符串，'' 已被上方桶头分支拦截）。
  if (!id) return null
  let sessionsSnap: any
  let workspacesSnap: any
  try { sessionsSnap = services?.sessions?.list?.getSnapshot?.() } catch { sessionsSnap = undefined }
  try { workspacesSnap = services?.workspaces?.list?.getSnapshot?.() } catch { workspacesSnap = undefined }

  // Session hit? (byId presence decides identity)
  const sess = sessionsSnap?.byId?.[id]
  if (sess) {
    let workspaceId: WorkspaceId | null = null
    for (const ws of readWorkspaceSummaries(workspacesSnap)) {
      if ((ws.sessionIds ?? []).includes(id)) {
        workspaceId = ws.workspaceId
        break
      }
    }
    return { kind: 'session', sessionId: id as SessionId, workspaceId, title: sess.title ?? sess.name ?? id }
  }

  // Workspace hit?
  const ws = readWorkspaceSummaries(workspacesSnap).find((w: any) => w.workspaceId === id)
  if (ws) {
    return { kind: 'workspace', workspaceId: (ws.workspaceId ?? id) as WorkspaceId, title: ws.title ?? id }
  }

  // Neither hit → adjudication failed → visible rejection feedback.
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

export function SessionDrawer({ state, actions, workspaceNames, sessionNames, services }: SessionDrawerProps) {
  const { open, groups, searchQuery } = state
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // ── Drop zone state (ticket 02) ──
  const [dragOver, setDragOver] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // ── Reject feedback state (ticket 05) ──
  const [rejectFlash, setRejectFlash] = useState(false)

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

  // ── Click outside to close (non-modal) ──
  // Uses 'click' (not pointerdown) so HTML5 drag-and-drop from the sidebar
  // never fires it — a drag sequence produces no click event, while a plain
  // click anywhere outside the panel/trigger closes the drawer.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      actions.closeDrawer()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
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

  // ── Reject flash auto-clear (ticket 05, PRD 决策9: 约 1 秒) ──
  useEffect(() => {
    if (!rejectFlash) return
    const timer = setTimeout(() => setRejectFlash(false), 1000)
    return () => clearTimeout(timer)
  }, [rejectFlash])

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

    // 文件拖拽不是抽屉内容：types 含 'Files' 一律直接拒绝反馈，
    // 绝不落入空串桶头信号误建哨兵组。「无法识别」= 非 Files 且三级解析链全未命中。
    if ((e.dataTransfer.types ?? []).includes('Files')) {
      setRejectFlash(true)
      return
    }

    // 三级解析链（PRD 实现决策 4）：规范载荷 MIME → 前缀 text/plain → 裸 id 宽容裁决。
    const { data, bareText } = parseDragPayload(e)

    // Tiers 1–2: explicit protocol payloads behave exactly as before (fast path).
    if (data) {
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
      } else {
        // 合法 JSON 但 kind 不在协议枚举内（如 {kind:'x'}）→ 可见拒绝，不静默吞掉。
        setRejectFlash(true)
      }
      return
    }

    // Tier 3: 宽容裁决 —— 裸 id 交给服务快照定身份与归属。
    const bare = adjudicateBareId(bareText, services)
    if (!bare) {
      // 三级解析全未命中 → 可见拒绝反馈（约 1s 自动消退）；状态零变化。
      setRejectFlash(true)
      return
    }

    if (bare.kind === 'session') {
      // Dedup first: an already-managed session flashes wherever it lives.
      const exists = groups.some(g => g.entries.some(en => en.sessionId === bare.sessionId))
      if (exists) {
        setHighlightId(bare.sessionId)
        return
      }
      // 未归组（sessionIds 反查不到）→ 归入哨兵「未分组」分组（PRD 决策6），
      // 走与普通分组完全相同的 addEntry 去重/建组路径。
      if (bare.workspaceId === null) {
        actions.addEntry(UNGROUPED_WORKSPACE_ID, UNGROUPED_GROUP_TITLE, bare.sessionId, bare.title)
        return
      }

      actions.addEntry(
        bare.workspaceId,
        workspaceNames[bare.workspaceId] ?? bare.workspaceId,
        bare.sessionId,
        bare.title,
      )
    } else if (bare.kind === 'workspace') {
      const exists = groups.some(g => g.workspaceId === bare.workspaceId)
      if (exists) {
        setHighlightId(bare.workspaceId)
        return
      }
      actions.addGroupWithSessions(bare.workspaceId, bare.title)
    } else {
      // 桶头信号：创建/填充哨兵「未分组」分组（成员由装配层从新鲜快照收集）。
      // 已存在则与普通分组一样只高亮不重建。
      const exists = groups.some(g => g.workspaceId === UNGROUPED_WORKSPACE_ID)
      if (exists) {
        setHighlightId(UNGROUPED_WORKSPACE_ID)
        return
      }
      actions.addGroupWithSessions(UNGROUPED_WORKSPACE_ID, UNGROUPED_GROUP_TITLE)
    }
  }, [actions, groups, workspaceNames, sessionNames, services])

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

  // 落点无关性（PRD 决策8）：仅内部排序拖拽进行中才在条目级响应；
  // 外部拖入不拦截，让事件冒泡到面板级统一处理。
  // dragIndex 必须进依赖：闭包要看到拖拽开始后的最新状态，否则守卫恒真、
  // 条目级落点高亮静默失效。
  const handleEntryDragOver = useCallback((e: React.DragEvent, groupWsId: WorkspaceId, entryIdx: number) => {
    if (!dragIndex) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ groupWsId, entryIdx })
  }, [dragIndex])

  const handleEntryDrop = useCallback((e: React.DragEvent, targetWsId: WorkspaceId, targetIdx: number) => {
    if (!dragIndex) return
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)

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
      {/* Trigger rail — left-edge tab, always rendered (dsh-web-ui-jx rail pattern) */}
      <button
        ref={triggerRef}
        className={css.rail}
        onClick={actions.toggle}
        title="会话抽屉（Ctrl+Shift+T）"
        aria-label="打开会话抽屉"
        aria-expanded={open}
      >
        {/* panel-left 图标：外框 + 左侧分隔条，贴合"左侧抽屉"语义 */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
        {groups.length > 0 && (
          <span className={css.badge}>{groups.reduce((sum, g) => sum + g.entries.length, 0)}</span>
        )}
      </button>

      {/* Popover panel — compact floating card anchored beside the rail.
          Non-modal: no backdrop, the whole page stays interactive so
          sessions can be dragged in from the sidebar. */}
      {open && (
        <div className={css.overlay}>
          <div
            ref={panelRef}
            className={clsx(css.panel, dragOver && css.panelDragOver, rejectFlash && css.rejectFlash)}
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
                placeholder="搜索会话…"
                value={searchQuery}
                onChange={(e) => actions.setSearch(e.target.value)}
              />
            </div>

            {/* Entry list */}
            <div className={css.entryList}>
              {filteredGroups.length === 0 && (
                <div className={css.emptyState}>
                  {groups.length === 0
                    ? '从侧边栏拖入会话或工作区到此抽屉'
                    : '没有匹配的会话'}
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
                      aria-label={`移除工作区 ${workspaceNames[group.workspaceId] ?? group.title}`}
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
                            dragIndex?.groupWsId === group.workspaceId && dragIndex?.entryIdx === idx && css.entryDragging,
                            dropTarget?.groupWsId === group.workspaceId && dropTarget?.entryIdx === idx && css.entryDropTarget,
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
                            aria-label={`移除会话 ${sessionNames[entry.sessionId] ?? entry.title}`}
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
              <div className={css.dropHint}>松手添加到此处</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
