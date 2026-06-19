import { useReactFlow, type NodeProps } from '@xyflow/react'

export default function NoteNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  return (
    <div className={`note-node${selected ? ' sel' : ''}`}>
      <textarea
        className="nodrag nowheel"
        value={String((data as { text?: string }).text ?? '')}
        placeholder="Write a note…"
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        rows={3}
        spellCheck={false}
      />
    </div>
  )
}
