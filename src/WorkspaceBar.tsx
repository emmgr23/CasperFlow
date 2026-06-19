import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import type { Workspace } from './workspaces'

interface Props {
  workspaces: Workspace[]
  activeId: string
  onSwitch: (id: string) => void
  onCreate: () => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onExport: () => void
  onImport: () => void
}

const PINS_KEY = 'casperflow-ws-pins'
const MAX_PINS = 5

export default function WorkspaceBar({
  workspaces, activeId, onSwitch, onCreate, onRename,
  onDuplicate, onDelete, onExport, onImport,
}: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pins, setPins] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PINS_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  const [dragOver, setDragOver] = useState(false)
  const active = workspaces.find((w) => w.id === activeId)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  // Workspace number = position in creation order (1-based).
  const numberOf = (id: string) => workspaces.findIndex((w) => w.id === id) + 1

  // Keep only pins that still point to an existing workspace; persist.
  const livePins = pins.filter((id) => workspaces.some((w) => w.id === id))
  useEffect(() => {
    if (livePins.length !== pins.length) setPins(livePins)
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify(livePins))
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, workspaces])

  const pin = (id: string) => {
    setPins((p) => (p.includes(id) || p.length >= MAX_PINS ? p : [...p, id]))
  }
  const unpin = (id: string) => setPins((p) => p.filter((x) => x !== id))

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData('text/ws-id')
    if (id) {
      pin(id)
      setOpen(false)
    }
  }

  return (
    <div className="ws-bar" ref={ref}>
      <div
        className={`ws-cluster${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/ws-id')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={(e) => {
          // Only clear when actually leaving the cluster, not when moving between children.
          if (!e.currentTarget.contains(e.relatedTarget as HTMLElement)) setDragOver(false)
        }}
        onDrop={onDrop}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="ws-name-input"
            defaultValue={active?.name}
            onBlur={(e) => {
              onRename(activeId, e.target.value.trim() || 'Untitled')
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <button
            className="ws-current"
            onClick={() => setOpen((o) => !o)}
            title="Workspaces — click to switch, drag one onto the bar to pin it"
          >
            <Icon name="layout" size={14} />
            <span className="ws-current-name">Workspace</span>
            {active && <span className="ws-current-num">{numberOf(activeId)}</span>}
            <Icon name="branch" size={12} style={{ opacity: 0.5, transform: 'rotate(90deg)' }} />
          </button>
        )}

        {/* Pinned quick-switch buttons (drop a workspace anywhere on the bar to pin it) */}
        <div className="ws-pins">
          {livePins.map((id) => {
            const w = workspaces.find((x) => x.id === id)!
            return (
              <button
                key={id}
                className={`ws-pin${id === activeId ? ' active' : ''}`}
                onClick={() => onSwitch(id)}
                title={w.name}
              >
                <span className="ws-pin-num">{numberOf(id)}</span>
                <span className="ws-pin-name">{w.name}</span>
                <span
                  className="ws-pin-x"
                  title="Unpin"
                  onClick={(e) => {
                    e.stopPropagation()
                    unpin(id)
                  }}
                >
                  ×
                </span>
              </button>
            )
          })}
          {dragOver && livePins.length < MAX_PINS && (
            <span className="ws-pin-drop">+ drop to pin</span>
          )}
        </div>
      </div>

      {open && (
        <div className="ws-menu">
          <div className="ws-menu-hint">Drag a workspace onto the bar to pin it</div>
          <div className="ws-list">
            {workspaces.map((w, i) => (
              <button
                key={w.id}
                className={`ws-item${w.id === activeId ? ' active' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/ws-id', w.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => {
                  onSwitch(w.id)
                  setOpen(false)
                }}
              >
                <span className="ws-item-num">{i + 1}</span>
                <span className="ws-item-name">{w.name}</span>
                {pins.includes(w.id) && (
                  <Icon name="star" size={11} className="ws-item-pinned" />
                )}
                {workspaces.length > 1 && (
                  <span
                    className="ws-item-del"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete "${w.name}"?`)) onDelete(w.id)
                    }}
                  >
                    <Icon name="trash" size={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="ws-actions">
            <button onClick={() => { onCreate(); setOpen(false) }}>
              <Icon name="note" size={13} /> New agent (templates / AI)
            </button>
            <button onClick={() => { setEditing(true); setOpen(false) }}>
              <Icon name="edit" size={13} /> Rename
            </button>
            <button onClick={() => { onDuplicate(activeId); setOpen(false) }}>
              <Icon name="copy" size={13} /> Duplicate
            </button>
            <div className="ws-sep" />
            <button onClick={() => { onExport(); setOpen(false) }}>
              <Icon name="download" size={13} /> Export JSON
            </button>
            <button onClick={() => { onImport(); setOpen(false) }}>
              <Icon name="upload" size={13} /> Import JSON
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
