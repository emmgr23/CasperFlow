import { useEffect, useRef } from 'react'

// {{var}} token pattern (matches substituteVars in modules.ts).
const TOKEN = '\\{\\{\\s*([\\w.]+)\\s*\\}\\}'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Build the editable field's inner HTML from a {{var}} string: text stays text,
// each {{var}} becomes an atomic, non-editable pill.
function buildHtml(value: string): string {
  const re = new RegExp(TOKEN, 'g')
  let html = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(value))) {
    if (m.index > last) html += escapeHtml(value.slice(last, m.index)).replace(/\n/g, '<br>')
    // Agent variables ({{agent}}, {{agent1}}…) are always yellow, like the AGENT badge.
    const agentCls = /^agent\d*$/i.test(m[1]) ? ' var-token-agent' : ''
    html += `<span class="var-token${agentCls}" contenteditable="false" data-var="${m[1]}">${m[1]}</span>`
    last = m.index + m[0].length
  }
  if (last < value.length) html += escapeHtml(value.slice(last)).replace(/\n/g, '<br>')
  return html
}

// Serialize the contenteditable DOM back to a {{var}} string.
function serialize(root: HTMLElement): string {
  let out = ''
  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
    } else if (node instanceof HTMLElement) {
      if (node.dataset.var) out += `{{${node.dataset.var}}}`
      else if (node.tagName === 'BR') out += '\n'
      else {
        // Block wrapper (DIV/P from pressing Enter): newline boundary, then recurse.
        if (out && !out.endsWith('\n')) out += '\n'
        node.childNodes.forEach(walk)
      }
    }
  }
  root.childNodes.forEach(walk)
  return out
}

function placeCaretEnd(el: HTMLElement) {
  const r = document.createRange()
  r.selectNodeContents(el)
  r.collapse(false)
  const s = window.getSelection()
  s?.removeAllRanges()
  s?.addRange(r)
}

// Editable field where each {{var}} shows as a pill, stored back as {{var}}.
export default function VariableInput({
  value,
  onChange,
  placeholder,
  className,
  multiline = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  multiline?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef('')
  const composing = useRef(false)

  // Rebuild the DOM only when the value changes from the outside (Insert buttons,
  // programmatic edits) — never while the user is typing, so the caret is kept.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value !== last.current) {
      el.innerHTML = buildHtml(value)
      last.current = value
      if (document.activeElement === el) placeCaretEnd(el)
    }
  }, [value])

  const emit = () => {
    const el = ref.current
    if (!el || composing.current) return
    const s = serialize(el)
    last.current = s
    onChange(s)
  }

  return (
    <div
      ref={ref}
      className={`var-input${multiline ? ' var-input-multi' : ''}${className ? ' ' + className : ''}`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      data-placeholder={placeholder || ''}
      onInput={emit}
      onBlur={() => {
        emit()
        // Re-render so any {{var}} the user typed by hand becomes a pill too.
        const el = ref.current
        if (el) el.innerHTML = buildHtml(last.current)
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
        emit()
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') e.preventDefault()
      }}
    />
  )
}
