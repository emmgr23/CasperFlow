import Icon from './Icon'

export interface MenuState {
  kind: 'node' | 'edge' | 'pane' | 'selection'
  id?: string
  x: number
  y: number
}

interface Props {
  menu: MenuState
  nodeKind?: 'module' | 'group' | 'note'
  inGroup?: boolean
  selectionCount: number
  selectedEdgeCount: number
  edgeCount: number
  onClose: () => void
  onNodeParams: (id: string) => void
  onNodeDuplicate: (id: string) => void
  onNodeDelete: (id: string) => void
  onEdgeDelete: (id: string) => void
  onDeleteSelectedEdges: () => void
  onDeleteAllEdges: () => void
  onSelectAllEdges: () => void
  onGroupSelection: () => void
  onUngroup: (id: string) => void
  onRemoveFromGroup: (id: string) => void
  onUngroupAllOf: (id: string) => void
  onDuplicateSelection: () => void
  onDeleteSelection: () => void
  onAddNote: () => void
  onClearCanvas: () => void
}

export default function ContextMenu({
  menu, nodeKind = 'module', inGroup = false, selectionCount,
  selectedEdgeCount, edgeCount, onClose,
  onNodeParams, onNodeDuplicate, onNodeDelete, onEdgeDelete,
  onDeleteSelectedEdges, onDeleteAllEdges, onSelectAllEdges,
  onGroupSelection, onUngroup, onRemoveFromGroup, onUngroupAllOf,
  onDuplicateSelection, onDeleteSelection,
  onAddNote, onClearCanvas,
}: Props) {
  const item = (icon: string, label: string, action: () => void, danger = false) => (
    <button
      className={`ctx-item${danger ? ' ctx-danger' : ''}`}
      onClick={() => { action(); onClose() }}
    >
      <Icon name={icon} size={14} className="ctx-icon" />
      {label}
    </button>
  )

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
        {menu.kind === 'selection' && (
          <>
            {item('group', `Group ${selectionCount} actions`, onGroupSelection)}
            {item('copy', 'Duplicate selection', onDuplicateSelection)}
            {item('trash', 'Delete selection', onDeleteSelection, true)}
          </>
        )}

        {menu.kind === 'node' && menu.id && nodeKind === 'module' && (
          <>
            {selectionCount > 1 && item('group', `Group ${selectionCount} actions`, onGroupSelection)}
            {item('gear', 'Settings', () => onNodeParams(menu.id!))}
            {item('copy', 'Duplicate', () => onNodeDuplicate(menu.id!))}
            {inGroup && item('ungroup', 'Remove from group', () => onRemoveFromGroup(menu.id!))}
            {inGroup && item('ungroup', 'Ungroup all', () => onUngroupAllOf(menu.id!))}
            {item('trash', 'Delete', () => onNodeDelete(menu.id!), true)}
          </>
        )}

        {menu.kind === 'node' && menu.id && nodeKind === 'group' && (
          <>
            {item('ungroup', 'Ungroup', () => onUngroup(menu.id!))}
            {item('trash', 'Delete group', () => onNodeDelete(menu.id!), true)}
          </>
        )}

        {menu.kind === 'node' && menu.id && nodeKind === 'note' && (
          <>{item('trash', 'Delete note', () => onNodeDelete(menu.id!), true)}</>
        )}

        {menu.kind === 'edge' && menu.id && (
          <>
            {item('scissors', 'Delete this connection', () => onEdgeDelete(menu.id!), true)}
            {selectedEdgeCount > 1 &&
              item('trash', `Delete ${selectedEdgeCount} selected connections`, onDeleteSelectedEdges, true)}
            {edgeCount > 1 && item('branch', 'Select all connections', onSelectAllEdges)}
            {edgeCount > 1 && item('scissors', 'Delete all connections', onDeleteAllEdges, true)}
          </>
        )}

        {menu.kind === 'pane' && (
          <>
            {item('note', 'Add note', onAddNote)}
            {selectedEdgeCount > 0 &&
              item('trash', `Delete ${selectedEdgeCount} selected connection${selectedEdgeCount > 1 ? 's' : ''}`, onDeleteSelectedEdges, true)}
            {edgeCount > 0 && item('branch', 'Select all connections', onSelectAllEdges)}
            {edgeCount > 0 && item('scissors', 'Delete all connections', onDeleteAllEdges, true)}
            {item('trash', 'Clear canvas', onClearCanvas, true)}
          </>
        )}
      </div>
    </>
  )
}
