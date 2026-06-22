import { type ReactNode } from 'react'

// {{var}} token pattern (matches substituteVars in modules.ts).
const TOKEN = '\\{\\{\\s*([\\w.]+)\\s*\\}\\}'

// Read-only: render a string, turning every {{var}} into a pill.
export function renderChips(text: string): ReactNode {
  if (!text) return text
  const re = new RegExp(TOKEN, 'g')
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    // Agent variables ({{agent}}, {{agent1}}, {{agent2}}…) are always yellow,
    // matching the AGENT badge, so the link to the agent is obvious.
    const isAgent = /^agent\d*$/i.test(m[1])
    out.push(
      <span className={`var-token${isAgent ? ' var-token-agent' : ''}`} key={i++}>
        {m[1]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
