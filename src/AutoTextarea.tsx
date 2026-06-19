import { useEffect, useLayoutEffect, useRef } from 'react'

// A textarea that auto-grows to fit its content (plus a little breathing room
// below), so the user never has to resize it manually.
export default function AutoTextarea({
  value,
  onChange,
  className,
  placeholder,
  minHeight = 80,
  extra = 26,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  minHeight?: number
  extra?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(minHeight, el.scrollHeight + extra)}px`
  }

  // Fit on mount (e.g. when reopening an action) and whenever the value changes.
  useLayoutEffect(resize, [value])
  useEffect(() => {
    resize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <textarea
      ref={ref}
      className={className}
      placeholder={placeholder}
      spellCheck={false}
      value={value}
      onInput={resize}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
