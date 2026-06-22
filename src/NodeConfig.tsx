import { useEffect, useState } from 'react'
import { useReactFlow, useNodes } from '@xyflow/react'
import { aiVarName, aiNodesOrdered } from './aiVars'
import { moduleByType, defaultParams, SIGNABLE, type Params } from './modules'
import { fetchCsprPrice } from './price'
import WalletNodeBack from './WalletNodeBack'
import RecipientField from './RecipientField'
import VariableInput from './VariableInput'
import { AGENT_TOOLS, AGENT_ROLES, inferToolsFromGoal } from './agentTools'
import Icon from './Icon'
import type { ModuleNodeData } from './ModuleNode'

// Full configuration UI for one node — rendered in the right-side inspector panel.
export default function NodeConfig({ id, data }: { id: string; data: ModuleNodeData }) {
  const { updateNodeData, getEdges } = useReactFlow()
  const allNodes = useNodes()
  const def = moduleByType(data.moduleType)
  const isPrice = data.moduleType === 'price'
  const isWallet = data.moduleType === 'wallet'
  const needsPrice = isPrice || (def?.params.some((p) => p.key === 'entry') ?? false)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!needsPrice) return
    let active = true
    const tick = async () => {
      const p = await fetchCsprPrice()
      if (active) setLivePrice(p)
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [needsPrice])

  if (!def) return null
  const params = { ...defaultParams(def), ...(data.params ?? {}) }
  const setParam = (key: string, value: string | number) =>
    updateNodeData(id, { params: { ...params, [key]: value } })
  // Set several params atomically (avoids stale-closure clobbering on back-to-back updates).
  const setParams = (patch: Record<string, string | number>) =>
    updateNodeData(id, { params: { ...params, ...patch } })

  // Pre-run safety: for a Send CSPR node, find the wallet that will sign (the
  // nearest Wallet node upstream) so we can warn — at config time, before any
  // run — if the recipient is that same wallet (Casper rejects self-transfers
  // as "Invalid purse"). Catching it here avoids a wasted run.
  const upstreamWallet = (() => {
    if (data.moduleType !== 'transfer') return null
    const edges = getEdges()
    const visited = new Set<string>()
    let frontier = edges.filter((e) => e.target === id).map((e) => e.source)
    while (frontier.length) {
      const next: string[] = []
      for (const sid of frontier) {
        if (visited.has(sid)) continue
        visited.add(sid)
        const n = allNodes.find((x) => x.id === sid)
        const nd = n?.data as ModuleNodeData | undefined
        if (nd?.moduleType === 'wallet') {
          const wp = nd.params || {}
          return { name: String(wp.walletName || 'this wallet'), pub: String(wp.walletPublic || '') }
        }
        edges.filter((e) => e.target === sid).forEach((e) => next.push(e.source))
      }
      frontier = next
    }
    return null
  })()
  const recipientTo = String(params.to ?? '').trim().toLowerCase()
  const isSelfTransfer =
    !!upstreamWallet?.pub && !!recipientTo && recipientTo === upstreamWallet.pub.toLowerCase()

  // Pre-run safety for an Autonomous Agent goal: if the user typed an amount
  // below Casper's 2.5 CSPR native-transfer minimum (e.g. "2 CSPR", "2.4 CSPR"),
  // warn right under the field, before any run.
  const belowMinAmount = (() => {
    if (data.moduleType !== 'agent') return null
    const g = String(params.goal ?? '')
    const re = /(\d+(?:[.,]\d+)?)\s*cspr\b/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(g))) {
      const v = parseFloat(m[1].replace(',', '.'))
      if (v > 0 && v < 2.5) return v
    }
    return null
  })()

  // Variables offered as one-click "Insert" chips. AI outputs (ai, ai2, …) are
  // added dynamically. An AI node only sees the AIs BEFORE it (so they can feed
  // each other in the right order); other actions see them all.
  const aiOrdered = aiNodesOrdered(allNodes)
  const myAiRank =
    data.moduleType === 'ai' ? aiOrdered.findIndex((n) => n.id === id) + 1 : Infinity
  const aiVars = aiOrdered
    .map((_, i) => (i === 0 ? 'ai' : `ai${i + 1}`))
    .filter((_, i) => i + 1 < myAiRank)
  const insertVars = [
    ...aiVars,
    'balance', 'sentcount', 'senttotal', 'price', 'amount', 'net', 'time', 'date',
    'hash', 'txurl', 'txurls', 'txhashes', 'txlist', 'claimhash', 'symbol',
    'x402body', 'x402endpoint', 'x402amount',
  ]

  const renderField = (p: (typeof def.params)[number]) => {
    // Internal control rendered inside the tools picker, not as its own field.
    if (p.key === 'toolsMode') return null
    // Send CSPR recipient: paste a key, pick a saved wallet, or resolve a CSPR.name.
    if (data.moduleType === 'transfer' && p.key === 'to') {
      return (
        <div key={p.key} className="node-field">
          <label>Recipient</label>
          <RecipientField params={params} setParams={setParams} />
          {isSelfTransfer && (
            <div className="field-warn">
              <Icon name="shield" size={13} />
              <span>
                This recipient is the same wallet that signs ({upstreamWallet?.name}). Casper rejects
                sending to your own purse (&quot;Invalid purse&quot;), so this transfer will be blocked.
                Choose a different recipient.
              </span>
            </div>
          )}
        </div>
      )
    }
    // Autonomous Agent role: a dropdown of suggested roles that still allows a
    // custom one (free text + <datalist>), so nobody has to guess what to type.
    if (data.moduleType === 'agent' && p.key === 'role') {
      return (
        <div key={p.key} className="node-field">
          <label>Role</label>
          <input
            type="text"
            list="agent-roles-list"
            placeholder="Pick one or write your own (e.g. Treasury operator)"
            value={String(params.role ?? '')}
            onChange={(e) => setParam('role', e.target.value)}
          />
          <datalist id="agent-roles-list">
            {AGENT_ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
      )
    }
    // Autonomous Agent goal: free English, plus a live warning if the user names
    // an amount below Casper's 2.5 CSPR minimum (caught before any run).
    if (data.moduleType === 'agent' && p.key === 'goal') {
      return (
        <div key={p.key} className="node-field">
          <label>{p.label}</label>
          <VariableInput
            multiline
            placeholder="Describe the goal in plain English…"
            value={String(params.goal ?? '')}
            onChange={(v) => setParam('goal', v)}
          />
          {belowMinAmount != null && (
            <div className="field-warn">
              <Icon name="shield" size={13} />
              <span>
                You wrote {belowMinAmount} CSPR. Casper&apos;s minimum native transfer is 2.5 CSPR, so a
                send below that will be blocked. Use 2.5 CSPR or more.
              </span>
            </div>
          )}
        </div>
      )
    }
    // Autonomous Agent toolbox: in "Auto", the tools are inferred from the goal
    // (nothing to pick). In "Manual", pick them from clickable tags. ⚡ = signs.
    if (data.moduleType === 'agent' && p.key === 'tools') {
      const isAuto = String(params.toolsMode ?? 'auto') === 'auto'
      const inferred = inferToolsFromGoal(String(params.goal ?? ''))
      const manualSel = String(params.tools ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const activeSet = new Set(isAuto ? inferred : manualSel)
      const idsToCsv = (ids: Set<string>) =>
        AGENT_TOOLS.filter((t) => ids.has(t.id)).map((t) => t.id).join(',')
      const toggle = (toolId: string) => {
        const next = new Set(activeSet)
        if (next.has(toolId)) next.delete(toolId)
        else next.add(toolId)
        // Editing a chip implies manual control, so switch out of Auto.
        setParams({ toolsMode: 'manual', tools: idsToCsv(next) })
      }
      return (
        <div key={p.key} className="node-field">
          <label>
            Tools the agent can use
            <span className="tool-mode">
              <button
                type="button"
                className={`tool-mode-btn${isAuto ? ' on' : ''}`}
                onClick={() => setParam('toolsMode', 'auto')}
              >
                Auto
              </button>
              <button
                type="button"
                className={`tool-mode-btn${!isAuto ? ' on' : ''}`}
                onClick={() => setParams({ toolsMode: 'manual', tools: idsToCsv(activeSet) })}
              >
                Manual
              </button>
            </span>
          </label>
          <div className="tool-tags">
            {AGENT_TOOLS.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`tool-tag${activeSet.has(t.id) ? ' on' : ''}${isAuto ? ' auto' : ''}`}
                onClick={() => toggle(t.id)}
                title={t.spec.description}
              >
                {t.label}
                {t.signs && <span className="tool-tag-sign" title="Signs a transaction">⚡</span>}
              </button>
            ))}
          </div>
          {isAuto && (
            <div className="tool-auto-hint">
              Chosen automatically from your goal. Edit your goal to change them, or click a tool to
              switch to Manual.
            </div>
          )}
        </div>
      )
    }
    const isThreshold = (isPrice && p.key === 'threshold') || p.key === 'entry'
    const stepFor = (v: number) => {
      const abs = Math.abs(v)
      if (abs === 0 || abs < 0.001) return 0.0001
      if (abs < 0.01) return 0.001
      if (abs < 1) return 0.01
      return 1
    }
    const decimalsFor = (v: number) => {
      const s = String(v)
      const i = s.indexOf('.')
      return i === -1 ? 0 : s.length - i - 1
    }
    const bump = (dir: 1 | -1) => {
      const cur = Number(params[p.key]) || 0
      const step = stepFor(cur)
      const next = Math.max(0, cur + dir * step)
      const dec = Math.max(decimalsFor(step), decimalsFor(cur))
      const rounded = Number(next.toFixed(dec))
      setParam(p.key, rounded)
      setEditing((s) => ({ ...s, [p.key]: String(rounded) }))
    }
    const shownValue = p.key in editing ? editing[p.key] : String(params[p.key])
    return (
      <div key={p.key} className="node-field">
        <label>
          {p.label}
          {p.suffix ? ` (${p.suffix})` : ''}
          {isThreshold && livePrice !== null && (
            <button
              type="button"
              className="field-fill"
              onClick={() => {
                setParam(p.key, livePrice)
                setEditing((s) => ({ ...s, [p.key]: String(livePrice) }))
              }}
            >
              use live ${livePrice}
            </button>
          )}
        </label>
        {p.key === 'code' ? (
          <textarea
            className="code-editor"
            rows={9}
            spellCheck={false}
            value={String(params[p.key])}
            onChange={(e) => setParam(p.key, e.target.value)}
          />
        ) : p.type === 'select' ? (
          <select value={String(params[p.key])} onChange={(e) => setParam(p.key, e.target.value)}>
            {p.options!.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : p.type === 'number' ? (
          <div className="num-field">
            <input
              type="text"
              inputMode="decimal"
              value={shownValue}
              onChange={(e) => {
                const raw = e.target.value.replace(',', '.')
                if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
                setEditing((s) => ({ ...s, [p.key]: raw }))
                if (raw !== '' && raw !== '.' && !raw.endsWith('.')) setParam(p.key, Number(raw))
              }}
              onBlur={() => {
                const raw = editing[p.key]
                if (raw !== undefined) setParam(p.key, raw === '' || raw === '.' ? 0 : Number(raw))
                setEditing((s) => {
                  const c = { ...s }
                  delete c[p.key]
                  return c
                })
              }}
            />
            <div className="num-steppers">
              <button type="button" onClick={() => bump(1)} aria-label="increase">
                <Icon name="chevron" size={11} style={{ transform: 'rotate(-90deg)' }} />
              </button>
              <button type="button" onClick={() => bump(-1)} aria-label="decrease">
                <Icon name="chevron" size={11} style={{ transform: 'rotate(90deg)' }} />
              </button>
            </div>
          </div>
        ) : /(message|instruction|data|args|prompt|question|goal|proposal)/i.test(p.key) ? (
          <>
            <VariableInput
              multiline
              placeholder={
                /(instruction|prompt|question)/i.test(p.key)
                  ? 'Type your question for the AI — it sees live values, insert them with the chips below.'
                  : undefined
              }
              value={String(params[p.key])}
              onChange={(v) => setParam(p.key, v)}
            />
            {/(message|endpoint|url|instruction|data|args)/i.test(p.key) && (
              <div className="field-vars">
                <span className="field-vars-label">Insert:</span>
                {insertVars.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="var-chip"
                    onClick={() => setParam(p.key, `${String(params[p.key])}{{${v}}}`)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <VariableInput
              value={String(params[p.key])}
              onChange={(v) => setParam(p.key, v)}
            />
            {/(message|endpoint|url|instruction|title|content)/i.test(p.key) && (
              <div className="field-vars">
                <span className="field-vars-label">Insert:</span>
                {insertVars.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="var-chip"
                    onClick={() => setParam(p.key, `${String(params[p.key])}{{${v}}}`)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const core = def.params.filter((p) => !p.advanced)
  const adv = def.params.filter((p) => p.advanced)

  return (
    <div className="nodeconfig">
      {isWallet ? (
        <WalletNodeBack id={id} params={params} />
      ) : (
        <>
          {data.moduleType === 'ai' && (
            <div className="ai-output-note">
              This AI's answer is saved as the <b>{aiVarName(allNodes, id)}</b> tag. Later steps (Attest,
              Notification, even another AI) can drop it in with the matching <b>Insert</b> button.
            </div>
          )}
          {isPrice &&
            (() => {
              const t = Number(params.threshold)
              const mode = String(params.mode)
              const matched =
                livePrice === null ? null : mode === 'goes above' ? livePrice > t : livePrice < t
              return (
                <div className="node-back-live">
                  <span className="live-dot" />
                  <span className="nbl-price">
                    {livePrice !== null ? `$${livePrice}` : 'connecting…'}
                  </span>
                  <span className="nbl-label">CSPR live</span>
                  {matched !== null && (
                    <span className={`nbl-state ${matched ? 'ok' : 'no'}`}>
                      {matched ? 'rule met ✓' : 'not met'}
                    </span>
                  )}
                </div>
              )
            })()}
          {core.map(renderField)}
          {adv.length > 0 && (
            <>
              <button
                type="button"
                className="adv-toggle"
                onClick={() => updateNodeData(id, { showAdvanced: !data.showAdvanced })}
              >
                <Icon
                  name="chevron"
                  size={12}
                  style={{ transform: data.showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)' }}
                />
                Advanced ({adv.length})
              </button>
              {data.showAdvanced && adv.map(renderField)}
            </>
          )}
          {SIGNABLE(def.category) && (
            <div className="node-signing-note">
              <Icon name="wallet" size={14} className="nsn-icon" />
              <span>
                Signing mode (autonomous / ask) is set on the <b>Wallet</b> this action connects to.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
