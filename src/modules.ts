export type ModuleCategory =
  | 'trigger'
  | 'logic'
  | 'agent'
  | 'trading'
  | 'payments'
  | 'contracts'
  | 'rwa'
  | 'output'
export type Params = Record<string, string | number>

export interface ParamDef {
  key: string
  label: string
  type: 'number' | 'text' | 'select'
  options?: string[]
  default: string | number
  suffix?: string
  advanced?: boolean // shown under a collapsible "Advanced" section on the card
}

export interface RunContext {
  telegramToken?: string
  telegramChatId?: string
  discordWebhook?: string
  casperNet?: 'testnet' | 'mainnet'
  csprCloudKey?: string
  watchedAccount?: string
  vars?: Record<string, string | number>
  ai?: import('./ai').AiConfig
}

export interface RunResult {
  output: string
  pass?: boolean
  vars?: Record<string, string | number> // values this action exposes to later actions
}

// Replace {{var}} placeholders in a string using the run's variable bag.
export function substituteVars(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  )
}

// Variables every action can reference (documented in the wiki).
export const KNOWN_VARS = [
  'price', 'amount', 'net', 'balance', 'account', 'from', 'cspr', 'spend', 'time', 'date',
]

// Safe arithmetic evaluator: only digits, + - * / ( ) . and spaces.
export function evalMaybeMath(expr: string): string | number {
  const s = expr.trim()
  if (/^-?[\d\s.+\-*/()]+$/.test(s) && /[\d]/.test(s)) {
    try {
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict"; return (${s});`)()
      if (typeof v === 'number' && isFinite(v)) return Number(v.toFixed(6))
    } catch {
      /* fall through to string */
    }
  }
  return expr
}

// Evaluate a single numeric side of a comparison ("balance", "4700", "10*2").
function evalNumSide(part: string): number | null {
  const t = part.trim()
  if (!t) return null
  if (/^-?[\d\s.+\-*/()]+$/.test(t) && /\d/.test(t)) {
    try {
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict"; return (${t});`)()
      if (typeof v === 'number' && isFinite(v)) return v
    } catch {
      /* fall through */
    }
  }
  const n = Number(t)
  return isNaN(n) ? null : n
}

// REAL condition evaluation. Substitutes variable names (e.g. "balance") with
// their run values, strips %/$/commas, then compares both sides numerically.
// Returns ok=false when the rule can't be understood (the gate then stops, the
// safe default for a money guardrail). This replaced a Math.random() stub.
export function evalCondition(
  expr: string,
  vars: Record<string, string | number>,
): { ok: boolean; value: boolean } {
  let s = String(expr ?? '')
  // {{var}} form first.
  s = s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => (key in vars ? String(vars[key]) : '0'))
  // Bare variable names (longest first so "balance2" beats "balance").
  for (const k of Object.keys(vars).sort((a, b) => b.length - a.length)) {
    if (!/^[a-zA-Z_]\w*$/.test(k)) continue
    s = s.replace(new RegExp(`\\b${k}\\b`, 'g'), String(vars[k]))
  }
  s = s.replace(/[%$,]/g, '')
  const m = s.match(/(>=|<=|==|!=|=|>|<)/)
  if (!m) {
    const n = Number(s.trim())
    return isNaN(n) ? { ok: false, value: false } : { ok: true, value: n !== 0 }
  }
  const op = m[1]
  const idx = s.indexOf(op)
  const lhs = evalNumSide(s.slice(0, idx))
  const rhs = evalNumSide(s.slice(idx + op.length))
  if (lhs == null || rhs == null) return { ok: false, value: false }
  let value = false
  if (op === '>') value = lhs > rhs
  else if (op === '<') value = lhs < rhs
  else if (op === '>=') value = lhs >= rhs
  else if (op === '<=') value = lhs <= rhs
  else if (op === '!=') value = lhs !== rhs
  else value = lhs === rhs // '==' or '='
  return { ok: true, value }
}

export interface ModuleDef {
  type: string
  label: string
  category: ModuleCategory
  icon: string
  params: ParamDef[]
  describe: (p: Params) => string
  simulate: (p: Params, ctx: RunContext) => RunResult | Promise<RunResult>
  hidden?: boolean // kept working for existing flows, but not shown in the palette
}

// Order here = display order in the palette.
export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  trigger: 'Triggers',
  logic: 'Logic',
  agent: 'AI Agent',
  trading: 'Trading & DeFi',
  payments: 'Payments',
  contracts: 'Smart contracts',
  rwa: 'Real-world assets',
  output: 'Outputs',
}

// Rainbow order, top to bottom (red → orange → yellow → green → teal → blue →
// indigo → violet), matching the palette display order for a clean, structured look.
export const CATEGORY_COLORS: Record<ModuleCategory, { bg: string; border: string; text: string }> = {
  trigger: { bg: 'rgba(248, 113, 113, 0.14)', border: '#f87171', text: '#fee2e2' }, // red
  logic: { bg: 'rgba(251, 146, 60, 0.14)', border: '#fb923c', text: '#ffedd5' }, // orange
  agent: { bg: 'rgba(250, 204, 21, 0.14)', border: '#facc15', text: '#fef9c3' }, // yellow
  trading: { bg: 'rgba(74, 222, 128, 0.13)', border: '#4ade80', text: '#dcfce7' }, // green
  payments: { bg: 'rgba(45, 212, 191, 0.13)', border: '#2dd4bf', text: '#ccfbf1' }, // teal
  contracts: { bg: 'rgba(96, 165, 250, 0.13)', border: '#60a5fa', text: '#dbeafe' }, // blue
  rwa: { bg: 'rgba(129, 140, 248, 0.14)', border: '#818cf8', text: '#e0e7ff' }, // indigo
  output: { bg: 'rgba(192, 132, 252, 0.14)', border: '#c084fc', text: '#f3e8ff' }, // violet
}

// Categories whose actions can be signed autonomously or require approval.
export const SIGNABLE = (c: ModuleCategory) =>
  c === 'trading' || c === 'payments' || c === 'contracts' || c === 'rwa' || c === 'agent'

// Three tiers of reality, shown on every card:
//  'live' = works for real now (real reads, real signed transactions, real sends)
//  'beta' = best-effort / partial real integration, may fall back to simulation
//  'soon' = preview only; greyed in the palette, "Coming soon"
export type ModuleStatus = 'live' | 'beta' | 'soon'

export const MODULE_STATUS: Record<string, ModuleStatus> = {
  // ── Live: real today ──
  wallet: 'live',
  schedule: 'live',
  condition: 'live',
  setvar: 'live',
  agent: 'beta', // autonomous tool-using agent (new)
  council: 'beta', // multi-agent vote with quorum + escalation (new)
  oracle: 'beta', // brings external data into the flow (CSPR price live; custom URL best-effort)
  delay: 'live',
  cooldown: 'live',
  spendlimit: 'live', // budget guardrail: blocks real payments above the cap
  code: 'live',
  ai: 'live',
  readbalance: 'live', // real on-chain balance read (CSPR.cloud)
  price: 'live',
  balance: 'live',
  incoming: 'live',
  notify: 'live',
  discord: 'live',
  webhook: 'live',
  transfer: 'live', // real signed testnet transaction
  stake: 'live', // real delegate/undelegate/redelegate
  callcontract: 'live', // real contract call
  attest: 'live', // real EIP-712 attestation anchored on testnet
  // ── Beta: partial / best-effort ──
  swap: 'beta',
  deploytoken: 'beta', // no-code CEP-18 token deploy (needs the compiled wasm in /public)
  deploynft: 'beta', // no-code CEP-78 NFT collection deploy (needs cep78.wasm in /public)
  mintnft: 'beta', // mint into a deployed CEP-78 collection
  quote: 'live', // real on-chain DEX rate read (CSPR.cloud)
  x402: 'live', // real pay-per-call: 402 → pay on Casper → server verifies on-chain → resource
  x402sell: 'live', // monetize: publish an agent's output as a paid x402 listing
  receipt: 'live', // verifiable on-chain payment receipt (reads the settlement)
  pegmonitor: 'beta',
  // everything else defaults to 'soon'
}
export const statusOf = (type: string): ModuleStatus => MODULE_STATUS[type] ?? 'soon'

// Default is generous so descriptive text (AI instruction, agent goal, messages…)
// shows in full on the canvas and the node grows to fit. Compact embedded fields
// pass an explicit small n to stay short.
const trunc = (s: string, n = 1000) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

import { getCsprPrice, fetchCsprPrice } from './price'
import { sendTelegram, sendDiscord, isDiscordWebhook } from './notify'
import { getAccountBalance, getRecentTransfers, getDexRate, shortKey } from './casper'
import { askAi, askText } from './ai'
import { agentMemory } from './runtime'

// ── Realistic DEX execution model (CSPR.trade, Uniswap-V2 style) ──
const LP_FEE = 0.003 // 0.30% liquidity-provider fee
const POOL_DEPTH_CSPR = 2_000_000 // assumed CSPR-side pool depth for impact estimate

// Constant-product price impact: selling `amount` into a pool of `depth`.
function priceImpact(amountCspr: number): number {
  return amountCspr / (amountCspr + POOL_DEPTH_CSPR)
}

export interface SwapExec {
  grossUsd: number
  feeUsd: number
  impactPct: number
  netUsd: number
  line: string
}

// Sell CSPR -> stablecoin, returning a realistic breakdown.
function execSellCspr(amountCspr: number, price: number, slippagePct: number): SwapExec {
  const gross = amountCspr * price
  const fee = gross * LP_FEE
  const impact = priceImpact(amountCspr)
  const net = gross * (1 - LP_FEE) * (1 - impact)
  const line =
    `${amountCspr} CSPR @ $${price} = $${gross.toFixed(2)} gross · ` +
    `fee 0.30% (-$${fee.toFixed(2)}) · impact ${(impact * 100).toFixed(2)}% · ` +
    `slippage ≤ ${slippagePct}% → net ≈ $${net.toFixed(2)}`
  return { grossUsd: gross, feeUsd: fee, impactPct: impact * 100, netUsd: net, line }
}

// Buy CSPR with stablecoin.
function execBuyCspr(amountUsd: number, price: number, slippagePct: number): string {
  const fee = amountUsd * LP_FEE
  const effective = amountUsd - fee
  const cspr = effective / price
  const impact = priceImpact(cspr)
  const got = cspr * (1 - impact)
  return (
    `$${amountUsd} @ $${price} · fee 0.30% (-$${fee.toFixed(2)}) · ` +
    `impact ${(impact * 100).toFixed(2)}% · slippage ≤ ${slippagePct}% → ≈ ${got.toFixed(0)} CSPR`
  )
}

export const MODULES: ModuleDef[] = [
  {
    type: 'schedule',
    label: 'Schedule',
    category: 'trigger',
    icon: 'clock',
    params: [
      {
        key: 'repeat',
        label: 'Run',
        type: 'select',
        options: ['Repeat every', 'Once after'],
        default: 'Repeat every',
      },
      { key: 'interval', label: 'Interval', type: 'number', default: 5 },
      {
        key: 'unit',
        label: 'Unit',
        type: 'select',
        options: ['seconds', 'minutes', 'hours'],
        default: 'minutes',
      },
    ],
    describe: (p) => {
      const n = Number(p.interval)
      const v = Number.isFinite(n) && n > 0 ? n : 5
      const unit = String(p.unit ?? 'minutes')
      const u = v === 1 ? unit.replace(/s$/, '') : unit
      const once = String(p.repeat) === 'Once after'
      return `${once ? 'Once after' : 'Every'} ${v} ${u}`
    },
    simulate: (p) => {
      const n = Number(p.interval)
      const v = Number.isFinite(n) && n > 0 ? n : 5
      const once = String(p.repeat) === 'Once after'
      return {
        output: `${once ? 'One-shot' : 'Triggered'} (${v} ${p.unit ?? 'min'}) at ${new Date().toLocaleTimeString('en-GB')}`,
      }
    },
  },
  {
    type: 'price',
    label: 'Price threshold',
    category: 'trigger',
    icon: 'trending',
    params: [
      { key: 'token', label: 'Token', type: 'select', options: ['CSPR'], default: 'CSPR' },
      {
        key: 'mode',
        label: 'Trigger when price',
        type: 'select',
        options: ['goes above', 'goes below', 'exits range'],
        default: 'goes below',
      },
      { key: 'threshold', label: 'Threshold', type: 'number', default: 0.02, suffix: '$' },
    ],
    describe: (p) => `${p.token} ${p.mode} $${p.threshold}`,
    simulate: (p) => {
      const live = getCsprPrice()
      if (live === null) {
        return { output: `${p.token} live price unavailable — check connection`, pass: false }
      }
      const t = Number(p.threshold)
      const pass =
        p.mode === 'goes above' ? live > t : p.mode === 'goes below' ? live < t : true
      return {
        output: `${p.token} LIVE price: $${live} — rule "${p.mode} $${t}" ${pass ? 'matched ✓' : 'not matched'}`,
        pass,
        vars: { price: live },
      }
    },
  },
  {
    // Brings an external (off-chain) value into the flow as a variable, so later
    // steps can act on real-world data. The data oracle, distinct from the Agent
    // Council (which is a decision oracle).
    type: 'oracle',
    label: 'Oracle (external data)',
    category: 'trigger',
    icon: 'link',
    params: [
      {
        key: 'source',
        label: 'Data source',
        type: 'select',
        options: ['CSPR price (USD)', 'Custom JSON URL'],
        default: 'CSPR price (USD)',
      },
      { key: 'url', label: 'JSON endpoint (for Custom)', type: 'text', default: '' },
      { key: 'field', label: 'Field path (e.g. main.temp)', type: 'text', default: '' },
      { key: 'varName', label: 'Save as variable', type: 'text', default: 'oracle' },
    ],
    describe: (p) =>
      String(p.source) === 'Custom JSON URL'
        ? `Read ${p.field || 'value'} from ${trunc(String(p.url || 'a URL'), 28)}`
        : 'Read the live CSPR price (USD)',
    simulate: async (p): Promise<RunResult> => {
      const vn = String(p.varName || 'oracle').trim() || 'oracle'
      if (String(p.source) === 'Custom JSON URL') {
        const url = String(p.url || '').trim()
        if (!url) return { output: 'Oracle: set a JSON endpoint URL first.', pass: false }
        try {
          const r = await fetch(url)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const j: unknown = await r.json()
          const path = String(p.field || '').trim()
          const picked = path
            ? path.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), j)
            : j
          const out = typeof picked === 'object' ? JSON.stringify(picked) : String(picked)
          return {
            output: `Oracle: ${path || 'value'} = ${out}`,
            vars: { [vn]: out, oracle: out },
          }
        } catch (e) {
          return {
            output: `Oracle: could not read ${url} — ${e instanceof Error ? e.message : 'error'}. Some sites block browser requests; a server proxy may be needed.`,
            pass: false,
          }
        }
      }
      const price = (await fetchCsprPrice()) ?? getCsprPrice()
      if (price == null) return { output: 'Oracle: CSPR price unavailable — check connection.', pass: false }
      return { output: `Oracle: CSPR price = $${price}`, vars: { [vn]: price, oracle: price } }
    },
  },
  {
    type: 'event',
    label: 'On-chain event',
    category: 'trigger',
    icon: 'zap',
    params: [
      {
        key: 'type',
        label: 'Event type',
        type: 'select',
        options: ['Transfer', 'Contract deploy', 'Contract call'],
        default: 'Transfer',
      },
      { key: 'min', label: 'Minimum amount', type: 'number', default: 10000, suffix: 'CSPR' },
    ],
    describe: (p) => `${p.type} ≥ ${Number(p.min).toLocaleString('en-US')} CSPR`,
    simulate: (p) => ({
      output: `${p.type} of 12,500 CSPR detected via CSPR.cloud stream (simulated)`,
    }),
  },
  {
    type: 'balance',
    label: 'Balance change',
    category: 'trigger',
    icon: 'wallet',
    params: [
      { key: 'account', label: 'Account (public key)', type: 'text', default: '01a3b5…f8e2' },
      { key: 'change', label: 'Change threshold', type: 'number', default: 5, suffix: '%' },
    ],
    describe: (p) => `Balance moves ±${p.change}%`,
    simulate: async (p, ctx) => {
      const acct = (ctx.watchedAccount || String(p.account)).trim()
      if (ctx.csprCloudKey && acct && ctx.casperNet) {
        const info = await getAccountBalance(ctx.casperNet, ctx.csprCloudKey, acct)
        if (info) {
          return {
            output: `LIVE balance of ${shortKey(acct)}: ${info.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} CSPR (${ctx.casperNet})`,
            vars: { balance: Number(info.balance.toFixed(2)), account: shortKey(acct) },
          }
        }
        return { output: 'Could not read balance — check Casper settings', pass: false }
      }
      return {
        output: `Balance of ${String(p.account).slice(0, 8)}… changed by +6.2% (simulated — add a CSPR.cloud key in Settings)`,
      }
    },
  },
  {
    type: 'incoming',
    label: 'Incoming transfer',
    category: 'trigger',
    icon: 'download',
    params: [
      { key: 'account', label: 'Watched account', type: 'text', default: '01a3b5…f8e2' },
      { key: 'min', label: 'Minimum amount', type: 'number', default: 100, suffix: 'CSPR' },
    ],
    describe: (p) => `Receives ≥ ${p.min} CSPR`,
    simulate: async (p, ctx) => {
      const acct = (ctx.watchedAccount || String(p.account)).trim()
      if (ctx.csprCloudKey && acct && ctx.casperNet) {
        const transfers = await getRecentTransfers(ctx.casperNet, ctx.csprCloudKey, acct, 5)
        if (transfers) {
          const incoming = transfers.filter(
            (t) => !t.out && t.amount >= Number(p.min),
          )
          if (incoming.length > 0) {
            const t = incoming[0]
            return {
              output: `LIVE: incoming ${t.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} CSPR from ${shortKey(t.peer)} (${ctx.casperNet})`,
              vars: { amount: Number(t.amount.toFixed(2)), from: shortKey(t.peer) },
            }
          }
          return {
            output: `No incoming transfer ≥ ${p.min} CSPR in last 5 (checked live)`,
            pass: false,
          }
        }
        return { output: 'Could not read transfers — check Casper settings', pass: false }
      }
      return {
        output: `Incoming transfer of 250 CSPR detected (simulated — add a CSPR.cloud key in Settings)`,
      }
    },
  },
  {
    type: 'oracle',
    label: 'Oracle price (Styks)',
    category: 'trigger',
    icon: 'target',
    params: [
      {
        key: 'mode',
        label: 'Trigger when price',
        type: 'select',
        options: ['goes above', 'goes below'],
        default: 'goes below',
      },
      { key: 'threshold', label: 'Threshold', type: 'number', default: 0.02, suffix: '$' },
    ],
    describe: (p) => `On-chain CSPR ${p.mode} $${p.threshold}`,
    simulate: (p) => {
      const live = getCsprPrice()
      if (live === null) return { output: 'Oracle read unavailable', pass: false }
      const t = Number(p.threshold)
      const pass = p.mode === 'goes above' ? live > t : live < t
      return {
        output: `Styks on-chain oracle: CSPR $${live} — rule "${p.mode} $${t}" ${pass ? 'matched ✓' : 'not matched'} (oracle route simulated)`,
        pass,
        vars: { price: live },
      }
    },
  },
  {
    type: 'nftwatch',
    label: 'NFT event (CEP-78)',
    category: 'trigger',
    icon: 'image',
    params: [
      { key: 'collection', label: 'Collection contract hash', type: 'text', default: 'hash-a1b2…' },
      {
        key: 'event',
        label: 'Event',
        type: 'select',
        options: ['Mint', 'Transfer', 'Burn'],
        default: 'Mint',
      },
    ],
    describe: (p) => `${p.event} in ${trunc(String(p.collection), 16)}`,
    simulate: (p) => ({
      output: `CEP-78 ${String(p.event).toLowerCase()} detected in ${trunc(String(p.collection), 14)} — token #1042 (simulated)`,
      vars: { nftEvent: String(p.event), tokenId: 1042 },
    }),
  },
  {
    type: 'launchwatch',
    label: 'New token launch',
    category: 'trigger',
    icon: 'rocket',
    params: [
      {
        key: 'source',
        label: 'Launchpad',
        type: 'select',
        options: ['Ghostminter'],
        default: 'Ghostminter',
      },
    ],
    describe: () => 'New CEP-18 on Ghostminter',
    simulate: () => ({
      output: 'New token "MOONCAT" launched on Ghostminter bonding curve — 2 min ago (simulated)',
      vars: { token: 'MOONCAT' },
    }),
  },
  {
    type: 'govwatch',
    label: 'Governance vote',
    category: 'trigger',
    icon: 'vote',
    params: [],
    describe: () => 'New Casper governance vote',
    simulate: () => ({
      output: 'New governance vote CVV-009 opened — voting ends in 7 days (simulated)',
      vars: { vote: 'CVV-009' },
    }),
  },
  {
    type: 'pegmonitor',
    label: 'Stablecoin peg',
    category: 'trigger',
    icon: 'anchor',
    params: [
      { key: 'stable', label: 'Stablecoin', type: 'select', options: ['USDC', 'USDT'], default: 'USDC' },
      { key: 'deviation', label: 'Alert if off peg by', type: 'number', default: 1, suffix: '%' },
    ],
    describe: (p) => `${p.stable} off $1 by ≥ ${p.deviation}%`,
    simulate: (p) => {
      // Demo: stablecoins normally hold ~$1; occasionally show a small deviation.
      const dev = Math.random() < 0.25 ? (Math.random() * 3 + 0.5) : Math.random() * 0.3
      const price = 1 - dev / 100
      const pass = dev >= Number(p.deviation)
      return {
        output: `${p.stable} at $${price.toFixed(4)} — ${dev.toFixed(2)}% off peg ${pass ? `(≥ ${p.deviation}% → ALERT)` : '(stable)'} (simulated)`,
        pass,
        vars: { stable: String(p.stable), deviation: Number(dev.toFixed(2)) },
      }
    },
  },
  {
    type: 'wallet',
    label: 'Wallet',
    category: 'logic',
    icon: 'wallet',
    params: [
      {
        key: 'mode',
        label: 'Signing',
        type: 'select',
        options: ['autonomous', 'manual'],
        default: 'autonomous',
      },
    ],
    describe: (p) => {
      const pk = p.walletPublic ? String(p.walletPublic) : ''
      const name = p.walletName ? String(p.walletName) : ''
      if (!pk) return 'No wallet — click to connect'
      const short = pk.length > 12 ? `${pk.slice(0, 6)}…${pk.slice(-4)}` : pk
      return `${name || short} · ${p.mode === 'manual' ? 'manual sign' : 'autonomous'}`
    },
    simulate: (p) => ({
      output: `Wallet active: ${p.walletName || p.walletPublic || 'none'} (${p.mode})`,
    }),
  },
  {
    type: 'condition',
    label: 'Condition',
    category: 'logic',
    icon: 'branch',
    params: [
      { key: 'expression', label: 'Rule (if…)', type: 'text', default: 'spread > 1%' },
    ],
    describe: (p) => `If ${p.expression}`,
    simulate: (p, ctx) => {
      const expr = String(p.expression ?? '').trim()
      const r = evalCondition(expr, ctx.vars ?? {})
      if (!r.ok) {
        return { output: `"${expr}" could not be evaluated → branch stops`, pass: false }
      }
      return {
        output: r.value ? `"${expr}" is true → continue` : `"${expr}" is false → branch stops`,
        pass: r.value,
      }
    },
  },
  {
    type: 'ai',
    label: 'AI decision',
    category: 'logic',
    icon: 'sparkles',
    // Folded into the AI Agent (the "Decide / gate" capability). Kept functional
    // so existing flows that use it still run, but no longer offered in the palette.
    hidden: true,
    params: [
      {
        key: 'instruction',
        label: 'Question for the AI',
        type: 'text',
        default: '',
      },
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        options: ['Decision (yes / no)', 'Generate text'],
        default: 'Decision (yes / no)',
      },
      {
        key: 'onNo',
        label: 'If the answer is NO',
        type: 'select',
        options: ['Stop the branch', 'Continue anyway'],
        default: 'Stop the branch',
      },
    ],
    describe: (p) => trunc(String(p.instruction)),
    simulate: async (p, ctx): Promise<RunResult> => {
      const dontStop = String(p.onNo) === 'Continue anyway'
      const generate = String(p.mode).startsWith('Generate')
      if (ctx.ai?.apiKey) {
        const price = getCsprPrice()
        const upstream = ctx.vars
          ? Object.entries(ctx.vars)
              .filter(([k]) => !k.startsWith('_'))
              .map(([k, v]) => `${k} = ${v}`)
              .join('; ')
          : ''
        // Lead with the on-chain facts the agent already gathered (balances,
        // prior-step results). The CSPR price is only a side reference — putting
        // it first made the model fixate on it and refuse for "lack of context".
        const context =
          (upstream
            ? `On-chain facts this agent already gathered this run (authoritative, treat as verified): ${upstream}.`
            : 'No prior values were gathered before this step.') +
          (price !== null ? ` (Reference only — CSPR market price: $${price}.)` : '')
        // ── Generate text mode: produce the requested text (e.g. a summary) ──
        if (generate) {
          const text = await askText(
            ctx.ai,
            'You are a concise assistant inside an on-chain automation. Produce ONLY the requested text (for example a short summary). 1–2 sentences, no preamble, no quotes, no yes/no.',
            `${p.instruction}\n\nRun context: ${context}`,
          )
          if (text && text.trim()) {
            const clean = text.trim()
            return { output: `AI: ${clean}`, pass: true, vars: { ai: clean } }
          }
          return {
            output: 'AI text generation failed (check key / provider) — continuing',
            pass: true,
            vars: { ai: '(summary unavailable)' },
          }
        }
        // ── Decision mode: yes / no gate ──
        const verdict = await askAi(ctx.ai, String(p.instruction), context)
        if (verdict) {
          return {
            output: `AI (${ctx.ai.provider}/${ctx.ai.model}): "${p.instruction}" → ${verdict.decision ? 'YES' : 'NO'} — ${verdict.reason}`,
            pass: dontStop ? true : verdict.decision,
            // Expose the AI's reasoning to downstream steps: {{ai}} (text) and {{aidecision}}.
            vars: { ai: verdict.reason, aidecision: verdict.decision ? 'YES' : 'NO' },
          }
        }
        return {
          output: `AI call failed (check key / provider) — "${p.instruction}" treated as ${dontStop ? 'continue' : 'skip'}`,
          pass: dontStop ? true : false,
        }
      }
      if (generate) {
        return {
          output: `AI summary (simulated — add a key in Settings → AI)`,
          pass: true,
          vars: { ai: 'Decision summary (simulated AI).' },
        }
      }
      return {
        output: `AI (simulated — add a key in Settings → AI): "${p.instruction}" → yes`,
        pass: true,
        vars: { ai: 'Looks good — proceeding (simulated AI).', aidecision: 'YES' },
      }
    },
  },
  {
    type: 'agent',
    label: 'AI Agent',
    category: 'agent',
    icon: 'sparkles',
    params: [
      { key: 'role', label: 'Role', type: 'text', default: 'Autonomous treasury operator' },
      { key: 'goal', label: 'Goal (plain English)', type: 'text', default: '' },
      // 'auto' = tools inferred from the goal (default, simplest for newcomers).
      // 'manual' = the explicit list in `tools`.
      { key: 'toolsMode', label: 'Tool selection', type: 'text', default: 'auto' },
      {
        key: 'tools',
        label: 'Tools (comma-separated)',
        type: 'text',
        default: 'read_balance,get_price,send_cspr,attest',
      },
      // Autonomy (sign on its own vs ask first) is decided by the connected
      // Wallet's mode, the single source of truth, so there's no duplicate
      // control here. The panel shows a hint pointing to the Wallet.
      // Visible flow-control: when the agent can decide, a "no" can stop the branch.
      {
        key: 'stopOnNo',
        label: 'Stop the flow if the agent decides no',
        type: 'select',
        options: ['Yes', 'No'],
        default: 'Yes',
      },
      { key: 'maxSteps', label: 'Max steps', type: 'number', default: 6 },
    ],
    describe: (p) => trunc(String(p.goal || p.role || 'Autonomous agent')),
    simulate: async (p): Promise<RunResult> => {
      // The real tool-using loop runs in App.tsx (it needs the signer + guardrails).
      // This fallback only fires if the agent runtime is unavailable.
      return {
        output: `AI Agent "${String(
          p.role || 'agent',
        )}" ran in preview. Add an AI key and connect a wallet to let it act for real.`,
        pass: true,
        vars: { agent: 'preview' },
      }
    },
  },
  {
    type: 'council',
    label: 'Agent Council',
    category: 'agent',
    icon: 'shield-check',
    params: [
      {
        key: 'proposal',
        label: 'Proposal to decide (plain English)',
        type: 'text',
        default: '',
      },
      {
        key: 'members',
        label: 'Council members (roles, comma-separated)',
        type: 'text',
        default: 'Risk officer, Compliance officer, Treasury operator',
      },
      { key: 'quorum', label: 'Approvals needed (quorum)', type: 'number', default: 2 },
      {
        key: 'anchor',
        label: 'Anchor the decision on Casper',
        type: 'select',
        options: ['No', 'Yes'],
        default: 'No',
      },
    ],
    describe: (p) =>
      trunc(
        String(p.proposal || 'A multi-agent vote') +
          ` · ${String(p.members || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean).length} members, quorum ${p.quorum || 2}`,
      ),
    simulate: async (p): Promise<RunResult> => {
      // The real multi-agent vote runs in App.tsx (needs the AI key + signer for
      // optional anchoring). This fallback only fires if the runtime is missing.
      return {
        output: `Agent Council "${String(p.proposal || 'proposal').slice(0, 40)}" ran in preview. Add an AI key to let the members vote for real.`,
        pass: true,
        vars: { council: 'preview' },
      }
    },
  },
  {
    type: 'setvar',
    label: 'Set variable',
    category: 'logic',
    icon: 'tag',
    params: [
      { key: 'name', label: 'Variable name', type: 'text', default: 'count' },
      {
        key: 'op',
        label: 'Operation',
        type: 'select',
        options: [
          'Count up (+1 each run)',
          'Add amount',
          'Subtract amount',
          'Multiply by',
          'Set to a number',
          'Set to text',
          'Copy another variable',
        ],
        default: 'Count up (+1 each run)',
      },
      { key: 'operand', label: 'Amount / value', type: 'text', default: '1' },
      {
        key: 'persist',
        label: 'Remember across runs',
        type: 'select',
        options: ['Yes (memory)', 'No (this run only)'],
        default: 'Yes (memory)',
      },
    ],
    describe: (p) => {
      const op = String(p.op)
      if (op.startsWith('Count up')) return `${p.name} + 1 each run`
      if (op === 'Add amount') return `${p.name} + ${p.operand}`
      if (op === 'Subtract amount') return `${p.name} − ${p.operand}`
      if (op === 'Multiply by') return `${p.name} × ${p.operand}`
      if (op === 'Copy another variable') return `${p.name} = ${p.operand}`
      return `${p.name} = ${p.operand}`
    },
    simulate: (p, ctx) => {
      const name = String(p.name)
      const op = String(p.op)
      const cur = Number(ctx.vars?.[name] ?? 0)
      const operandRaw = String(p.operand)
      const operandNum = Number(operandRaw)
      let result: string | number
      switch (op) {
        case 'Count up (+1 each run)':
          result = cur + 1
          break
        case 'Add amount':
          result = cur + (isFinite(operandNum) ? operandNum : 0)
          break
        case 'Subtract amount':
          result = cur - (isFinite(operandNum) ? operandNum : 0)
          break
        case 'Multiply by':
          result = cur * (isFinite(operandNum) ? operandNum : 1)
          break
        case 'Set to a number':
          result = isFinite(operandNum) ? operandNum : 0
          break
        case 'Copy another variable':
          result = ctx.vars?.[operandRaw] ?? 0
          break
        default: // Set to text
          result = operandRaw
      }
      if (typeof result === 'number') result = Number(result.toFixed(6))
      const persisted = String(p.persist).startsWith('Yes')
      return {
        output: `${name} = ${result}${persisted ? ' (saved to memory)' : ''}`,
        vars: { [name]: result },
      }
    },
  },
  {
    type: 'safety',
    label: 'Safety check',
    category: 'logic',
    icon: 'shield-alert',
    params: [
      { key: 'token', label: 'Token / contract', type: 'text', default: '{{token}}' },
      {
        key: 'checks',
        label: 'Screen for',
        type: 'select',
        options: ['Honeypot + sell tax', 'Honeypot + sell tax + liquidity', 'Full (incl. holder concentration)'],
        default: 'Honeypot + sell tax + liquidity',
      },
      { key: 'maxTax', label: 'Max sell tax', type: 'number', default: 10, suffix: '%', advanced: true },
      { key: 'minLiquidity', label: 'Min liquidity', type: 'number', default: 5000, suffix: '$', advanced: true },
    ],
    describe: (p) => `Screen ${trunc(String(p.token), 14)}`,
    simulate: (p) => {
      const safe = !String(p.token).toLowerCase().includes('scam')
      return {
        output: safe
          ? `Safety check passed for ${trunc(String(p.token), 16)}: not a honeypot, sell tax < ${p.maxTax}%, liquidity ≥ $${p.minLiquidity} (simulated)`
          : `Safety check FAILED: ${trunc(String(p.token), 16)} flagged as honeypot / high sell tax — branch stopped (simulated)`,
        pass: safe,
        vars: { safe: safe ? 'yes' : 'no' },
      }
    },
  },
  {
    type: 'trust',
    label: 'Trust score',
    category: 'logic',
    icon: 'star',
    params: [
      { key: 'address', label: 'Address to score', type: 'text', default: '{{from}}' },
      { key: 'minScore', label: 'Require score ≥', type: 'number', default: 60, suffix: '/100' },
    ],
    describe: (p) => `Trust ≥ ${p.minScore}/100`,
    simulate: (p) => {
      const score = Math.floor(Math.random() * 45) + 55 // 55–99
      const pass = score >= Number(p.minScore)
      return {
        output: `Trust score for ${trunc(String(p.address), 14)}: ${score}/100 (age, history, counterparties) ${pass ? '≥' : '<'} ${p.minScore} → ${pass ? 'trusted' : 'rejected'} (simulated)`,
        pass,
        vars: { trustScore: score },
      }
    },
  },
  {
    type: 'code',
    label: 'Custom code (JS)',
    category: 'logic',
    icon: 'file-code',
    params: [
      {
        key: 'code',
        label: 'JavaScript — cf is your toolkit. Return { output, pass, vars }',
        type: 'text',
        default:
          '// cf.price, cf.vars, cf.memory, await cf.ai(q),\n// await cf.notify(msg), await cf.getBalance(key), await cf.http(url)\nconst p = cf.price ?? 0\ncf.log("checking price")\nreturn {\n  output: "CSPR is at $" + p,\n  pass: p > 0,\n  vars: { doubled: p * 2 }\n}',
      },
    ],
    describe: () => 'Run your own JavaScript',
    simulate: async (p, ctx) => {
      const lines: string[] = []
      const cf = {
        price: getCsprPrice(),
        vars: { ...(ctx.vars ?? {}) },
        memory: agentMemory, // persists across runs (read/write)
        net: ctx.casperNet ?? 'testnet',
        log: (m: unknown) => lines.push(String(m)),
        ai: async (question: string) => {
          if (!ctx.ai?.apiKey) return 'no-ai-key'
          const v = await askAi(ctx.ai, question, `CSPR price ${getCsprPrice() ?? '?'}`)
          return v ? (v.decision ? 'yes' : 'no') : 'error'
        },
        ask: async (prompt: string) => {
          if (!ctx.ai?.apiKey) return 'no-ai-key'
          return (await askText(ctx.ai, 'You are a helpful assistant inside an automation. Answer briefly.', prompt)) ?? 'error'
        },
        notify: async (msg: string) => {
          if (ctx.telegramToken && ctx.telegramChatId) {
            return sendTelegram(ctx.telegramToken, ctx.telegramChatId, String(msg))
          }
          if (ctx.discordWebhook) return sendDiscord(ctx.discordWebhook, String(msg))
          return false
        },
        getBalance: async (account: string) => {
          if (!ctx.csprCloudKey || !ctx.casperNet) return null
          const info = await getAccountBalance(ctx.casperNet, ctx.csprCloudKey, account)
          return info?.balance ?? null
        },
        http: async (url: string) => {
          try {
            const r = await fetch(url)
            return await r.json()
          } catch {
            return null
          }
        },
      }
      try {
        const fn = new Function(
          'cf',
          'vars',
          'price',
          `"use strict"; return (async () => {\n${String(p.code)}\n})();`,
        ) as (cf: unknown, vars: unknown, price: number | null) => Promise<unknown>
        const res = await fn(cf, cf.vars, cf.price)
        const prefix = lines.length ? lines.join(' · ') + ' — ' : ''
        if (res && typeof res === 'object') {
          const r = res as { output?: unknown; pass?: unknown; vars?: unknown }
          return {
            output: prefix + String(r.output ?? 'done'),
            pass: r.pass === false ? false : undefined,
            vars:
              r.vars && typeof r.vars === 'object'
                ? (r.vars as Record<string, string | number>)
                : undefined,
          }
        }
        return { output: prefix + `returned: ${String(res)}` }
      } catch (e) {
        return {
          output: `Code error: ${e instanceof Error ? e.message : 'unknown'}`,
          pass: false,
        }
      }
    },
  },
  {
    type: 'delay',
    label: 'Delay',
    category: 'logic',
    icon: 'hourglass',
    params: [
      { key: 'minutes', label: 'Wait for', type: 'number', default: 10, suffix: 'min' },
    ],
    describe: (p) => `Wait ${p.minutes} minutes`,
    simulate: (p) => ({
      output: `Waiting ${p.minutes} min before next step (instant in simulation)`,
    }),
  },
  {
    type: 'cooldown',
    label: 'Cooldown',
    category: 'logic',
    icon: 'snowflake',
    params: [
      { key: 'hours', label: 'Max once every', type: 'number', default: 24, suffix: 'h' },
    ],
    describe: (p) => `Max once every ${p.hours}h`,
    simulate: (p) => ({
      output: `Cooldown check: last run > ${p.hours}h ago → allowed (simulated)`,
      pass: true,
    }),
  },
  {
    type: 'spendlimit',
    label: 'Spend limit',
    category: 'logic',
    icon: 'shield-dollar',
    params: [
      { key: 'max', label: 'Max spend', type: 'number', default: 10, suffix: 'CSPR' },
      {
        key: 'window',
        label: 'Per',
        type: 'select',
        options: ['This run', 'Day', 'All time'],
        default: 'Day',
      },
    ],
    describe: (p) => `Cap ${p.max} CSPR / ${String(p.window || 'Day').toLowerCase()}`,
    simulate: (p) => {
      const cap = Number(p.max) || 0
      const win = String(p.window || 'Day').toLowerCase()
      return {
        output: `Spend limit armed: this agent will not spend more than ${cap} CSPR per ${win}. Any real on-chain payment that would exceed the cap is blocked.`,
        vars: { spendcap: cap },
      }
    },
  },
  {
    type: 'x402',
    label: 'x402 payment',
    category: 'payments',
    icon: 'coin',
    params: [
      { key: 'endpoint', label: 'API to call (x402)', type: 'text', default: 'http://localhost:4021/premium' },
      { key: 'maxPrice', label: 'Max price per request', type: 'number', default: 3, suffix: 'CSPR' },
      { key: 'method', label: 'HTTP method', type: 'select', options: ['GET', 'POST'], default: 'GET', advanced: true },
      { key: 'verifyContains', label: 'Require response contains', type: 'text', default: '', advanced: true },
      { key: 'minLength', label: 'Min response length', type: 'number', default: 0, suffix: 'chars', advanced: true },
    ],
    describe: (p) => trunc(String(p.endpoint)),
    simulate: (p) => ({
      output: `${p.method ?? 'GET'} ${p.endpoint} → HTTP 402 → pay up to ${p.maxPrice} CSPR on Casper → server verifies the transfer on-chain → resource delivered${String(p.verifyContains || '').trim() || Number(p.minLength) > 0 ? ' → response verified before it is trusted' : ''} (simulated — connect a Wallet + enable live execution for a real payment)`,
      vars: { paid: Number(p.maxPrice) },
    }),
  },
  {
    type: 'x402sell',
    label: 'Sell via x402',
    category: 'output',
    icon: 'tag',
    params: [
      { key: 'endpoint', label: 'Publish to (x402 server)', type: 'text', default: 'http://localhost:4021/publish' },
      { key: 'content', label: 'What you sell', type: 'text', default: '{{ai}}' },
      { key: 'price', label: 'Price per call', type: 'number', default: 2.5, suffix: 'CSPR' },
    ],
    describe: (p) => `Sell output via x402 (${p.price} CSPR/call)`,
    simulate: async (p): Promise<RunResult> => {
      const endpoint = String(p.endpoint || '').trim()
      if (!endpoint || endpoint.includes('example')) {
        return {
          output: `Listed "${trunc(String(p.content), 40)}" at ${p.price} CSPR/call (simulated — point this at a running x402 server to go live)`,
          vars: { listed: 1 },
        }
      }
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: String(p.content), price: Number(p.price) }),
        })
        if (r.ok) {
          return {
            output: `✓ Listed on x402 at ${p.price} CSPR/call — other agents can now pay for: "${trunc(String(p.content), 60)}"`,
            vars: { listed: 1 },
          }
        }
        return { output: `Sell via x402 failed: HTTP ${r.status}`, pass: false }
      } catch (e) {
        return {
          output: `Sell via x402: could not reach ${endpoint} (${e instanceof Error ? e.message : 'network'}) — is the server running?`,
          pass: false,
        }
      }
    },
  },
  {
    type: 'receipt',
    label: 'Verifiable receipt',
    category: 'output',
    icon: 'certificate',
    params: [
      { key: 'title', label: 'Receipt title', type: 'text', default: 'Payment receipt' },
    ],
    describe: () => `On-chain verifiable receipt`,
    // Builds a permanent, explorer-verifiable receipt from the settlement an
    // upstream x402 payment (or Send) already produced this run. Pure read of
    // run variables — no extra transaction.
    simulate: (p, ctx): RunResult => {
      const v = ctx.vars ?? {}
      const tx = String(v.hash ?? v.paytx ?? '')
      const url = String(v.txurl ?? v.payexplorer ?? '')
      const amount = v.x402amount ?? v.payamount ?? v.amount ?? ''
      const to = String(v.x402payto ?? v.payto ?? v.to ?? '')
      const resource = String(v.x402endpoint ?? v.payresource ?? '')
      const net = String(ctx.casperNet ?? 'testnet')
      if (!tx) {
        return {
          output:
            'Receipt: no settled payment found upstream yet — place this node after an x402 payment or a Send so it can certify a real settlement.',
          pass: false,
        }
      }
      const lines = [
        `🧾 ${String(p.title || 'Payment receipt').toUpperCase()}`,
        resource ? `Resource: ${resource}` : '',
        amount !== '' ? `Amount:   ${amount} CSPR` : '',
        to ? `Paid to:  ${to}` : '',
        `Network:  ${net}`,
        `Settled:  ${tx}`,
        url ? `Verify:   ${url}` : '',
        `Time:     ${String(v.time ?? new Date().toISOString())}`,
      ].filter(Boolean)
      return { output: lines.join('\n'), vars: { receipt: tx } }
    },
  },
  {
    type: 'swap',
    label: 'CSPR.trade swap',
    category: 'trading',
    icon: 'repeat',
    params: [
      { key: 'tokenIn', label: 'From token', type: 'text', default: 'CSPR' },
      { key: 'tokenOut', label: 'To token', type: 'text', default: 'USDT' },
      { key: 'amount', label: 'Amount in', type: 'number', default: 100 },
      { key: 'slippage', label: 'Max slippage', type: 'number', default: 3, suffix: '%' },
      { key: 'deadline', label: 'Tx deadline', type: 'number', default: 20, suffix: 'min', advanced: true },
    ],
    describe: (p) => `Swap ${p.amount} ${p.tokenIn} → ${p.tokenOut}`,
    // Real execution goes through swapReal() (CSPR.trade SDK: build → sign local
    // → submit). This simulate() is the fallback when there's no wallet/live mode.
    simulate: (p) => {
      const impact = priceImpact(Number(p.amount))
      const fee = Number(p.amount) * LP_FEE
      return {
        output:
          `CSPR.trade swap: ${p.amount} ${p.tokenIn} → ${p.tokenOut} · LP fee 0.30% (-${fee.toFixed(2)}) · ` +
          `impact ${(impact * 100).toFixed(2)}% · slippage ≤ ${p.slippage}% · ` +
          `(preview — connect a Wallet + enable real execution to swap for real via the CSPR.trade SDK)`,
      }
    },
  },
  {
    type: 'quote',
    label: 'Get swap quote',
    category: 'trading',
    icon: 'tag',
    params: [
      { key: 'fromToken', label: 'From token (package hash)', type: 'text', default: '' },
      { key: 'toToken', label: 'To token (package hash)', type: 'text', default: '' },
      { key: 'amount', label: 'Amount in', type: 'number', default: 100 },
      { key: 'dexId', label: 'DEX id', type: 'number', default: 1, advanced: true },
    ],
    describe: (p) =>
      `Quote ${p.amount} ${String(p.fromToken).slice(0, 6) || '?'}… → ${String(p.toToken).slice(0, 6) || '?'}…`,
    // REAL: reads the live on-chain DEX rate from CSPR.cloud (free, read-only).
    simulate: async (p, ctx) => {
      const res = await getDexRate(
        ctx.casperNet ?? 'testnet',
        ctx.csprCloudKey ?? '',
        String(p.fromToken),
        String(p.toToken),
        Number(p.dexId) || undefined,
      )
      if ('error' in res) {
        return { output: `Swap quote unavailable — ${res.error}`, pass: false }
      }
      const out = Number(p.amount) * res.rate
      return {
        output: `LIVE DEX quote (dex ${res.dexId}): ${p.amount} → ${out.toFixed(6)} out · rate ${res.rate} · real on-chain`,
        vars: { quote: Number(out.toFixed(6)), rate: res.rate },
      }
    },
  },
  {
    type: 'limitorder',
    label: 'Limit order',
    category: 'trading',
    icon: 'target',
    params: [
      { key: 'side', label: 'Side', type: 'select', options: ['Buy', 'Sell'], default: 'Buy' },
      { key: 'target', label: 'Target price', type: 'number', default: 0.02, suffix: '$' },
      { key: 'amount', label: 'Amount', type: 'number', default: 500, suffix: 'CSPR' },
      { key: 'slippage', label: 'Max slippage', type: 'number', default: 1, suffix: '%' },
      { key: 'expiry', label: 'Expires after', type: 'number', default: 0, suffix: 'hours', advanced: true },
      {
        key: 'partial',
        label: 'Allow partial fills',
        type: 'select',
        options: ['No', 'Yes'],
        default: 'No',
        advanced: true,
      },
    ],
    describe: (p) => `${p.side} ${p.amount} CSPR @ $${p.target}`,
    simulate: (p) => {
      const live = getCsprPrice()
      if (live === null) return { output: 'Live price unavailable', pass: false }
      const t = Number(p.target)
      const ready = p.side === 'Buy' ? live <= t : live >= t
      if (!ready) {
        return {
          output: `Limit ${String(p.side).toLowerCase()} waiting — price $${live}, target $${t}`,
          pass: false,
        }
      }
      const ex = execSellCspr(Number(p.amount), live, Number(p.slippage))
      return {
        output: `LIMIT ${String(p.side).toUpperCase()} FILLED at $${live}: ${ex.line} (testnet, simulated)`,
        vars: { price: live, amount: Number(p.amount) },
      }
    },
  },
  {
    type: 'perp',
    label: 'Perp LONG/SHORT (Delta)',
    category: 'trading',
    icon: 'candles',
    params: [
      { key: 'side', label: 'Side', type: 'select', options: ['LONG', 'SHORT'], default: 'LONG' },
      { key: 'size', label: 'Position size', type: 'number', default: 100, suffix: '$' },
      { key: 'leverage', label: 'Leverage', type: 'number', default: 3, suffix: '×' },
      { key: 'takeProfit', label: 'Take-profit at', type: 'number', default: 0, suffix: '%', advanced: true },
      { key: 'stopLoss', label: 'Stop-loss at', type: 'number', default: 0, suffix: '%', advanced: true },
      {
        key: 'margin',
        label: 'Margin mode',
        type: 'select',
        options: ['Isolated', 'Cross'],
        default: 'Isolated',
        advanced: true,
      },
    ],
    describe: (p) => `${p.side} ${p.leverage}× · $${p.size}`,
    simulate: (p) => {
      const live = getCsprPrice()
      if (live === null) return { output: 'Live price unavailable', pass: false }
      const lev = Math.max(1, Number(p.leverage))
      const liq =
        p.side === 'LONG' ? live * (1 - 1 / lev) : live * (1 + 1 / lev)
      const fee = Number(p.size) * 0.0005
      return {
        output:
          `${p.side} opened on Casper Delta: $${p.size} at ${lev}× — entry $${live}, ` +
          `liquidation ≈ $${liq.toFixed(5)}, open fee $${fee.toFixed(2)} (testnet, simulated)`,
        vars: { price: live, entry: live, liquidation: Number(liq.toFixed(5)) },
      }
    },
  },
  {
    type: 'compound',
    label: 'Auto-compound staking',
    category: 'trading',
    icon: 'percent',
    params: [
      { key: 'staked', label: 'Currently staked', type: 'number', default: 10000, suffix: 'CSPR' },
      { key: 'minRewards', label: 'Compound when rewards ≥', type: 'number', default: 50, suffix: 'CSPR' },
    ],
    describe: (p) => `Re-stake rewards ≥ ${p.minRewards} CSPR`,
    simulate: (p) => {
      // ~11% APY accrual estimate since last weekly compound
      const weekly = (Number(p.staked) * 0.11) / 52
      if (weekly < Number(p.minRewards)) {
        return {
          output: `Rewards ≈ ${weekly.toFixed(1)} CSPR — below ${p.minRewards}, waiting to save fees`,
          pass: false,
        }
      }
      return {
        output: `Claimed ≈ ${weekly.toFixed(1)} CSPR rewards and re-delegated (compound). New stake ≈ ${(Number(p.staked) + weekly).toFixed(0)} CSPR (~11% APY) (testnet, simulated)`,
        vars: { rewards: Number(weekly.toFixed(1)) },
      }
    },
  },
  {
    type: 'predict',
    label: 'Prediction bet (CSPR.guru)',
    category: 'trading',
    icon: 'sparkles',
    params: [
      { key: 'market', label: 'Market question', type: 'text', default: 'Will CSPR close the week above $0.025?' },
      { key: 'position', label: 'Position', type: 'select', options: ['Yes', 'No'], default: 'Yes' },
      { key: 'stake', label: 'Stake', type: 'number', default: 25, suffix: 'CSPR' },
    ],
    describe: (p) => `Bet ${p.position} · ${p.stake} CSPR`,
    simulate: (p) => ({
      output: `Placed ${p.stake} CSPR on "${p.position}" for "${trunc(String(p.market), 40)}" via CSPR.guru (testnet, simulated). Tip: gate this with an AI decision.`,
      vars: { stake: Number(p.stake) },
    }),
  },
  {
    type: 'stoploss',
    label: 'Stop-loss',
    category: 'trading',
    icon: 'shield-dollar',
    params: [
      { key: 'entry', label: 'Entry price', type: 'number', default: 0.02, suffix: '$' },
      { key: 'drop', label: 'Trigger drop', type: 'number', default: 5, suffix: '%' },
      { key: 'amount', label: 'Position size', type: 'number', default: 1000, suffix: 'CSPR' },
      { key: 'stable', label: 'Sell to', type: 'select', options: ['USDC', 'USDT'], default: 'USDC' },
      { key: 'slippage', label: 'Max slippage', type: 'number', default: 1, suffix: '%' },
      { key: 'sellPct', label: 'Sell portion', type: 'number', default: 100, suffix: '%', advanced: true },
      {
        key: 'trailing',
        label: 'Trailing stop',
        type: 'select',
        options: ['Off', 'On (follows peak)'],
        default: 'Off',
        advanced: true,
      },
    ],
    describe: (p) => `Sell if −${p.drop}% from $${p.entry}`,
    simulate: (p) => {
      const price = getCsprPrice()
      if (price === null) return { output: 'Live price unavailable', pass: false }
      const stopPrice = Number(p.entry) * (1 - Number(p.drop) / 100)
      if (price > stopPrice) {
        return {
          output: `Holding — price $${price} above stop $${stopPrice.toFixed(5)} (−${p.drop}% from $${p.entry})`,
          pass: false,
        }
      }
      const ex = execSellCspr(Number(p.amount), price, Number(p.slippage))
      return {
        output: `STOP-LOSS HIT at $${price} → sold to ${p.stable}: ${ex.line} (simulated)`,
        vars: { price, amount: Number(p.amount), net: Number(ex.netUsd.toFixed(2)) },
      }
    },
  },
  {
    type: 'takeprofit',
    label: 'Take-profit',
    category: 'trading',
    icon: 'trending',
    params: [
      { key: 'entry', label: 'Entry price', type: 'number', default: 0.02, suffix: '$' },
      { key: 'gain', label: 'Target gain', type: 'number', default: 15, suffix: '%' },
      { key: 'amount', label: 'Position size', type: 'number', default: 1000, suffix: 'CSPR' },
      { key: 'stable', label: 'Sell to', type: 'select', options: ['USDC', 'USDT'], default: 'USDC' },
      { key: 'slippage', label: 'Max slippage', type: 'number', default: 1, suffix: '%' },
    ],
    describe: (p) => `Sell if +${p.gain}% from $${p.entry}`,
    simulate: (p) => {
      const price = getCsprPrice()
      if (price === null) return { output: 'Live price unavailable', pass: false }
      const target = Number(p.entry) * (1 + Number(p.gain) / 100)
      if (price < target) {
        return {
          output: `Holding — price $${price} below target $${target.toFixed(5)} (+${p.gain}% from $${p.entry})`,
          pass: false,
        }
      }
      const ex = execSellCspr(Number(p.amount), price, Number(p.slippage))
      const profit = ex.netUsd - Number(p.amount) * Number(p.entry)
      return {
        output: `TAKE-PROFIT HIT at $${price} → locked +$${profit.toFixed(2)} to ${p.stable}: ${ex.line} (simulated)`,
        vars: { price, amount: Number(p.amount), net: Number(ex.netUsd.toFixed(2)), profit: Number(profit.toFixed(2)) },
      }
    },
  },
  {
    type: 'dca',
    label: 'DCA buy',
    category: 'trading',
    icon: 'coin',
    params: [
      { key: 'spend', label: 'Buy each run', type: 'number', default: 50, suffix: '$' },
      { key: 'stable', label: 'Pay with', type: 'select', options: ['USDC', 'USDT'], default: 'USDC' },
      { key: 'slippage', label: 'Max slippage', type: 'number', default: 1, suffix: '%' },
      { key: 'priceCeiling', label: 'Skip buy above', type: 'number', default: 0, suffix: '$', advanced: true },
      { key: 'totalBudget', label: 'Total budget cap', type: 'number', default: 0, suffix: '$', advanced: true },
    ],
    describe: (p) => `Buy $${p.spend} CSPR each run`,
    simulate: (p) => {
      const price = getCsprPrice()
      if (price === null) return { output: 'Live price unavailable', pass: false }
      return {
        output: `DCA: ${execBuyCspr(Number(p.spend), price, Number(p.slippage))} (simulated)`,
      }
    },
  },
  {
    type: 'attest',
    label: 'Attest on Casper',
    category: 'contracts',
    icon: 'certificate',
    params: [
      { key: 'topic', label: 'Topic', type: 'text', default: 'agent-decision' },
      { key: 'data', label: 'What to attest', type: 'text', default: 'AI verdict {{aidecision}}: {{ai}} at {{time}}' },
      {
        key: 'anchor',
        label: 'On-chain anchor',
        type: 'select',
        options: ['Commitment (1 tx)', 'Full digest (4 tx)'],
        default: 'Commitment (1 tx)',
      },
      { key: 'amount', label: 'Anchor amount', type: 'number', default: 2.5, suffix: 'CSPR', advanced: true },
    ],
    describe: (p) => `Attest "${p.topic}" on Casper`,
    simulate: (p) => ({
      output: `Attestation "${p.topic}": would hash "${String(p.data).slice(0, 40)}…" (EIP-712) and anchor it on Casper (simulated — connect a Wallet + enable live execution for a real anchor)`,
      vars: { topic: String(p.topic) },
    }),
  },
  {
    type: 'readbalance',
    label: 'Read balance',
    category: 'logic',
    icon: 'coin',
    params: [
      {
        key: 'account',
        label: 'Account (blank = connected wallet)',
        type: 'text',
        default: '{{walletpublic}}',
      },
    ],
    describe: () => `Read CSPR balance on-chain`,
    simulate: async (p, ctx): Promise<RunResult> => {
      let acct = String(p.account || '').trim()
      // Fall back to the watched account if the wallet variable wasn't resolved.
      if (!acct || acct.includes('{{')) acct = (ctx.watchedAccount || '').trim()
      const known = ctx.vars?.balance
      if (ctx.csprCloudKey && acct && ctx.casperNet) {
        const info = await getAccountBalance(ctx.casperNet, ctx.csprCloudKey, acct)
        if (info) {
          const bal = Number(info.balance.toFixed(2))
          return {
            output: `Balance of ${shortKey(acct)}: ${bal.toLocaleString('en-US', { maximumFractionDigits: 2 })} CSPR (${ctx.casperNet})`,
            vars: { balance: bal, walletbalance: bal, account: shortKey(acct) },
          }
        }
        // Live read failed — never abort the run; reuse the balance the Wallet
        // node already read so the agent keeps going.
        if (typeof known === 'number') {
          return {
            output: `Balance read fell back to the connected wallet's value: ${known} CSPR.`,
            vars: { balance: known, walletbalance: known },
          }
        }
        return {
          output: 'Could not read balance live — continuing (check the CSPR.cloud key for a real read).',
          vars: { balance: 0 },
        }
      }
      return {
        output: `Read balance ${typeof known === 'number' ? `→ ${known} CSPR ` : ''}(connect a Wallet upstream, or add a CSPR.cloud key + account in Settings for a live read)`,
        vars: { balance: typeof known === 'number' ? known : 0 },
      }
    },
  },
  {
    type: 'deploytoken',
    label: 'Deploy token (CEP-18)',
    category: 'contracts',
    icon: 'coin',
    params: [
      { key: 'name', label: 'Token name', type: 'text', default: 'My Token' },
      { key: 'symbol', label: 'Symbol', type: 'text', default: 'MYT' },
      { key: 'decimals', label: 'Decimals', type: 'number', default: 9 },
      { key: 'supply', label: 'Total supply', type: 'number', default: 1000000 },
      {
        key: 'mintable',
        label: 'Supply',
        type: 'select',
        options: ['Fixed forever', 'Mintable / burnable'],
        default: 'Fixed forever',
      },
      {
        key: 'events',
        label: 'On-chain events',
        type: 'select',
        options: ['On (CES)', 'Off'],
        default: 'On (CES)',
      },
      { key: 'payment', label: 'Deploy gas', type: 'number', default: 200, suffix: 'CSPR', advanced: true },
    ],
    describe: (p) => `Deploy ${p.symbol} token (CEP-18)`,
    simulate: (p) => {
      const mint = String(p.mintable || '').startsWith('Mint') ? 'mintable/burnable' : 'fixed supply'
      return {
        output: `Would deploy a CEP-18 token "${p.name}" (${p.symbol}, ${p.decimals} decimals, supply ${p.supply}, ${mint}) on Casper (simulated — connect a Wallet, enable live execution, and add the CEP-18 wasm to /public for a real deploy)`,
        vars: { symbol: String(p.symbol) },
      }
    },
  },
  {
    type: 'deploynft',
    label: 'Deploy NFT collection (CEP-78)',
    category: 'contracts',
    icon: 'image',
    params: [
      { key: 'name', label: 'Collection name', type: 'text', default: 'My Collection' },
      { key: 'symbol', label: 'Symbol', type: 'text', default: 'MYNFT' },
      { key: 'supply', label: 'Max NFTs', type: 'number', default: 1000 },
      {
        key: 'ownership',
        label: 'Ownership',
        type: 'select',
        options: ['Transferable', 'Soulbound (non-transferable)', 'Minter-owned'],
        default: 'Transferable',
      },
      {
        key: 'minting',
        label: 'Who can mint',
        type: 'select',
        options: ['Only me (installer)', 'Public'],
        default: 'Only me (installer)',
      },
      {
        key: 'metadata',
        label: 'Metadata',
        type: 'select',
        options: ['Immutable', 'Mutable'],
        default: 'Immutable',
      },
      {
        key: 'burnable',
        label: 'Burnable',
        type: 'select',
        options: ['Yes', 'No'],
        default: 'Yes',
      },
      { key: 'payment', label: 'Deploy gas', type: 'number', default: 250, suffix: 'CSPR', advanced: true },
    ],
    describe: (p) => `Deploy ${p.symbol} NFT collection (CEP-78)`,
    simulate: (p) => ({
      output: `Would deploy a CEP-78 collection "${p.name}" (${p.symbol}, max ${p.supply}, ${String(p.ownership).toLowerCase()}, ${String(p.minting).toLowerCase()} minting, ${String(p.metadata).toLowerCase()} metadata, burnable: ${p.burnable}) on Casper (simulated — connect a Wallet, enable live execution, and add the CEP-78 wasm to /public for a real deploy)`,
      vars: { symbol: String(p.symbol) },
    }),
  },
  {
    type: 'mintnft',
    label: 'Mint NFT',
    category: 'contracts',
    icon: 'image',
    params: [
      { key: 'collection', label: 'Collection contract hash', type: 'text', default: '{{collection}}' },
      { key: 'name', label: 'NFT name', type: 'text', default: 'My NFT #1' },
      { key: 'image', label: 'Image URL', type: 'text', default: 'https://…' },
      { key: 'owner', label: 'Mint to (public key, blank = me)', type: 'text', default: '', advanced: true },
      { key: 'payment', label: 'Mint gas', type: 'number', default: 5, suffix: 'CSPR', advanced: true },
    ],
    describe: (p) => `Mint "${trunc(String(p.name), 18)}"`,
    simulate: (p) => ({
      output: `Would mint NFT "${p.name}" (image ${trunc(String(p.image), 30)}) into ${trunc(String(p.collection), 16)} on Casper (simulated — connect a Wallet + enable live execution to mint for real)`,
      vars: { nftname: String(p.name) },
    }),
  },
  {
    type: 'transfer',
    label: 'Send CSPR',
    category: 'payments',
    icon: 'send',
    params: [
      { key: 'to', label: 'Recipient (public key)', type: 'text', default: '' },
      { key: 'amount', label: 'Amount', type: 'number', default: 0, suffix: 'CSPR' },
      { key: 'transferId', label: 'Transfer ID (memo)', type: 'number', default: 0, advanced: true },
      { key: 'gasPayment', label: 'Gas payment', type: 'number', default: 0.1, suffix: 'CSPR', advanced: true },
      { key: 'minBalance', label: 'Only if balance ≥', type: 'number', default: 0, suffix: 'CSPR', advanced: true },
    ],
    describe: (p) => `${p.amount} CSPR → ${p.to ? `${String(p.to).slice(0, 8)}…` : 'recipient'}`,
    simulate: (p) => {
      const memo = Number(p.transferId) > 0 ? `, transfer-id ${p.transferId}` : ''
      return {
        output: `Native transfer: ${p.amount} CSPR → ${String(p.to).slice(0, 8)}…${memo} · fixed fee ${p.gasPayment} CSPR · deterministic finality (testnet, simulated)`,
        vars: { amount: Number(p.amount), to: String(p.to).slice(0, 10) },
      }
    },
  },
  {
    type: 'stake',
    label: 'Stake / delegate',
    category: 'trading',
    icon: 'shield',
    params: [
      {
        key: 'op',
        label: 'Operation',
        type: 'select',
        options: ['Delegate', 'Undelegate', 'Redelegate'],
        default: 'Delegate',
      },
      { key: 'validator', label: 'Validator', type: 'text', default: '01f2e4…c7d8' },
      { key: 'amount', label: 'Amount', type: 'number', default: 500, suffix: 'CSPR' },
      { key: 'newValidator', label: 'New validator (redelegate)', type: 'text', default: '', advanced: true },
      { key: 'gasPayment', label: 'Gas payment', type: 'number', default: 2.5, suffix: 'CSPR', advanced: true },
    ],
    describe: (p) => `${p.op} ${p.amount} CSPR`,
    simulate: (p) => {
      const amt = Number(p.amount)
      if (amt < 3) {
        return { output: `Minimum delegation on Casper is 3 CSPR (got ${amt}) — skipped`, pass: false }
      }
      const op = String(p.op)
      if (op === 'Undelegate') {
        return {
          output: `Undelegate ${amt} CSPR from ${String(p.validator).slice(0, 8)}… — funds released after the 7-era unbonding period (~14h), no rewards during unbonding (testnet, simulated)`,
          vars: { amount: amt },
        }
      }
      if (op === 'Redelegate') {
        return {
          output: `Redelegate ${amt} CSPR → ${String(p.newValidator || '02…new').slice(0, 8)}… (no unbonding wait between validators) (testnet, simulated)`,
          vars: { amount: amt },
        }
      }
      return {
        output: `Delegated ${amt} CSPR to ${String(p.validator).slice(0, 8)}… (fee ${p.gasPayment} CSPR, ~11% APY minus validator delegation rate) (testnet, simulated)`,
        vars: { amount: amt },
      }
    },
  },
  {
    type: 'callcontract',
    label: 'Call contract',
    category: 'contracts',
    icon: 'terminal',
    params: [
      { key: 'contract', label: 'Contract hash', type: 'text', default: 'hash-a1b2…' },
      { key: 'entrypoint', label: 'Entry point', type: 'text', default: 'transfer' },
      { key: 'args', label: 'Arguments (JSON)', type: 'text', default: '{ "amount": 100 }' },
      { key: 'payment', label: 'Gas payment', type: 'number', default: 2.5, suffix: 'CSPR', advanced: true },
    ],
    describe: (p) => `${p.entrypoint}() on ${String(p.contract).slice(0, 10)}…`,
    simulate: (p) => ({
      output: `Called ${p.entrypoint}(${trunc(String(p.args), 24)}) on contract ${String(p.contract).slice(0, 10)}… · fee ${p.payment} CSPR · deterministic finality (testnet, simulated)`,
      vars: { entrypoint: String(p.entrypoint) },
    }),
  },
  {
    type: 'bridge',
    label: 'Bridge assets',
    category: 'payments',
    icon: 'bridge',
    params: [
      { key: 'amount', label: 'Amount', type: 'number', default: 100, suffix: 'CSPR' },
      {
        key: 'toChain',
        label: 'To chain',
        type: 'select',
        options: ['Ethereum', 'BNB Chain', 'Polygon', 'Solana'],
        default: 'Ethereum',
      },
      { key: 'recipient', label: 'Destination address', type: 'text', default: '0x…' },
      {
        key: 'provider',
        label: 'Bridge',
        type: 'select',
        options: ['Ferrum', 'Auto (best route)'],
        default: 'Ferrum',
        advanced: true,
      },
    ],
    describe: (p) => `${p.amount} CSPR → ${p.toChain}`,
    simulate: (p) => ({
      output: `Bridging ${p.amount} CSPR → ${p.toChain} (${String(p.recipient).slice(0, 8)}…) via ${p.provider ?? 'Ferrum'}: locked on Casper, minted on destination (cross-chain, simulated)`,
      vars: { amount: Number(p.amount), chain: String(p.toChain) },
    }),
  },
  {
    type: 'deploy',
    label: 'Deploy contract',
    category: 'contracts',
    icon: 'file-code',
    params: [
      {
        key: 'template',
        label: 'Odra template',
        type: 'select',
        options: ['Token (CEP-18)', 'Tipping contract', 'Escrow'],
        default: 'Token (CEP-18)',
      },
    ],
    describe: (p) => `Odra: ${p.template}`,
    simulate: (p) => ({
      output: `Odra build "${p.template}" → tests 4/4 passed → deployed to testnet (simulated)`,
    }),
  },
  {
    type: 'compliance',
    label: 'Compliance gate',
    category: 'rwa',
    icon: 'shield-check',
    params: [
      { key: 'recipient', label: 'Recipient (public key)', type: 'text', default: '02c4d6…a1b9' },
      {
        key: 'jurisdiction',
        label: 'Allowed jurisdiction',
        type: 'select',
        options: ['EU (MiCA)', 'US (Reg D)', 'US (Reg S)', 'Global / KYC only'],
        default: 'EU (MiCA)',
      },
      {
        key: 'require',
        label: 'Require',
        type: 'select',
        options: ['KYC verified', 'KYC + accredited investor', 'KYC + qualified institutional'],
        default: 'KYC verified',
      },
      {
        key: 'claimTopics',
        label: 'Required claims (ERC-3643)',
        type: 'select',
        options: ['KYC', 'KYC + AML', 'KYC + AML + Accreditation'],
        default: 'KYC + AML',
        advanced: true,
      },
      { key: 'trustedIssuer', label: 'Trusted issuer', type: 'text', default: 'Tokeny / onchain ID', advanced: true },
      { key: 'maxTransfer', label: 'Max transfer size', type: 'number', default: 100000, suffix: '$', advanced: true },
      { key: 'lockup', label: 'Lock-up period', type: 'number', default: 0, suffix: 'days', advanced: true },
      { key: 'maxHolders', label: 'Max investors (cap)', type: 'number', default: 2000, advanced: true },
      {
        key: 'checks',
        label: 'Also verify',
        type: 'select',
        options: ['Identity only', 'Identity + not frozen', 'Identity + not frozen + not paused'],
        default: 'Identity + not frozen',
        advanced: true,
      },
      {
        key: 'onFail',
        label: 'If non-compliant',
        type: 'select',
        options: ['Block transfer', 'Flag for review'],
        default: 'Block transfer',
        advanced: true,
      },
    ],
    describe: (p) => `ERC-3643 check · ${p.jurisdiction}`,
    simulate: (p) => {
      // Demo: deterministic pass based on a pretend identity registry.
      const ok = !String(p.recipient).toLowerCase().includes('x')
      const claims = p.claimTopics ?? 'KYC + AML'
      return {
        output: ok
          ? `Compliance OK: ${String(p.recipient).slice(0, 8)}… holds valid ${claims} claims from ${p.trustedIssuer ?? 'trusted issuer'}, identity in registry, ${p.checks ?? 'not frozen'}, cleared for ${p.jurisdiction} (ERC-3643, simulated)`
          : `Compliance BLOCKED: recipient missing ${claims} claim for ${p.jurisdiction} — canTransfer() returned false, transfer halted (ERC-3643, simulated)`,
        pass: ok || String(p.onFail).startsWith('Flag'),
        vars: { compliant: ok ? 'yes' : 'no' },
      }
    },
  },
  {
    type: 'distribute',
    label: 'Distribute to holders',
    category: 'rwa',
    icon: 'split',
    params: [
      {
        key: 'kind',
        label: 'Revenue type',
        type: 'select',
        options: ['Rent', 'Royalties', 'Dividends'],
        default: 'Rent',
      },
      { key: 'amount', label: 'Total to distribute', type: 'number', default: 1000, suffix: 'CSPR' },
      { key: 'holders', label: 'Number of holders', type: 'number', default: 25 },
      {
        key: 'payToken',
        label: 'Pay in',
        type: 'select',
        options: ['CSPR', 'USDC', 'USDT'],
        default: 'CSPR',
        advanced: true,
      },
      { key: 'feePct', label: 'Management fee', type: 'number', default: 0, suffix: '%', advanced: true },
      { key: 'minPayout', label: 'Skip payouts below', type: 'number', default: 0.1, suffix: 'CSPR', advanced: true },
      {
        key: 'snapshot',
        label: 'Holder snapshot',
        type: 'select',
        options: ['At run time', 'Start of period'],
        default: 'At run time',
        advanced: true,
      },
    ],
    describe: (p) => `Split ${p.amount} ${p.payToken ?? 'CSPR'} · ${p.holders} holders`,
    simulate: (p) => {
      const holders = Math.max(1, Number(p.holders))
      const fee = Number(p.amount) * (Number(p.feePct) / 100)
      const net = Number(p.amount) - fee
      const per = net / holders
      const token = String(p.payToken ?? 'CSPR')
      const feeNote = fee > 0 ? ` (after ${p.feePct}% fee −${fee.toFixed(2)})` : ''
      return {
        output: `${p.kind} distribution: ${net.toFixed(2)} ${token}${feeNote} split pro-rata across ${holders} holders (≈ ${per.toFixed(2)} ${token} each), instant finality (simulated)`,
        vars: { distributed: Number(net.toFixed(2)), holders, perHolder: Number(per.toFixed(2)) },
      }
    },
  },
  {
    type: 'issue',
    label: 'Issue security token',
    category: 'rwa',
    icon: 'certificate',
    params: [
      { key: 'asset', label: 'Asset name', type: 'text', default: 'Singapore Office #12' },
      { key: 'shares', label: 'Total shares', type: 'number', default: 10000 },
      { key: 'price', label: 'Price per share', type: 'number', default: 50, suffix: '$' },
      {
        key: 'standard',
        label: 'Standard',
        type: 'select',
        options: ['ERC-3643 (security)', 'CEP-18 (utility)'],
        default: 'ERC-3643 (security)',
      },
      {
        key: 'income',
        label: 'Income type',
        type: 'select',
        options: ['Rental yield', 'Royalties', 'Dividends', 'None'],
        default: 'Rental yield',
        advanced: true,
      },
      {
        key: 'frequency',
        label: 'Distribution frequency',
        type: 'select',
        options: ['Monthly', 'Quarterly', 'On revenue'],
        default: 'Monthly',
        advanced: true,
      },
      { key: 'minInvest', label: 'Minimum investment', type: 'number', default: 50, suffix: '$', advanced: true },
      { key: 'lockup', label: 'Investor lock-up', type: 'number', default: 0, suffix: 'days', advanced: true },
      { key: 'issuer', label: 'Issuer / agent', type: 'text', default: 'Acme Capital Ltd', advanced: true },
      { key: 'maxPerInvestor', label: 'Max balance / investor', type: 'number', default: 0, suffix: '%', advanced: true },
      {
        key: 'countryRule',
        label: 'Country compliance module',
        type: 'select',
        options: ['Allow all (KYC)', 'EU only', 'US accredited only', 'Custom allowlist'],
        default: 'EU only',
        advanced: true,
      },
    ],
    describe: (p) => `${p.shares} shares of "${trunc(String(p.asset), 18)}"`,
    simulate: (p) => {
      const cap = Number(p.shares) * Number(p.price)
      return {
        output: `Issued "${p.asset}": ${Number(p.shares).toLocaleString('en-US')} shares @ $${p.price} (cap $${cap.toLocaleString('en-US')}) as ${p.standard} with compliance rules attached (simulated)`,
        vars: { asset: String(p.asset), shares: Number(p.shares), marketCap: cap },
      }
    },
  },
  {
    type: 'x402offer',
    label: 'Publish x402 service',
    category: 'rwa',
    icon: 'broadcast',
    params: [
      { key: 'service', label: 'Service name', type: 'text', default: 'CSPR price feed' },
      { key: 'price', label: 'Price per request', type: 'number', default: 0.003, suffix: 'CSPR' },
      { key: 'path', label: 'Endpoint path', type: 'text', default: '/api/price' },
      {
        key: 'payToken',
        label: 'Accept payment in',
        type: 'select',
        options: ['CSPR', 'USDC'],
        default: 'CSPR',
        advanced: true,
      },
      { key: 'dailyCap', label: 'Max requests / day', type: 'number', default: 10000, advanced: true },
      { key: 'rateLimit', label: 'Rate limit / caller', type: 'number', default: 60, suffix: '/min', advanced: true },
    ],
    describe: (p) => `Sell "${trunc(String(p.service), 16)}" @ ${p.price} CSPR/call`,
    simulate: (p) => ({
      output: `Published "${p.service}" at ${p.path} — other agents now pay ${p.price} CSPR per request via x402. 3 calls served this cycle → +${(Number(p.price) * 3).toFixed(3)} CSPR earned (simulated)`,
      vars: { earned: Number((Number(p.price) * 3).toFixed(3)), service: String(p.service) },
    }),
  },
  {
    type: 'onboard',
    label: 'Onboard investor',
    category: 'rwa',
    icon: 'user-plus',
    params: [
      { key: 'investor', label: 'Investor (public key)', type: 'text', default: '02c4d6…a1b9' },
      {
        key: 'type',
        label: 'Investor type',
        type: 'select',
        options: ['Retail', 'Accredited', 'Qualified institutional'],
        default: 'Accredited',
      },
      { key: 'country', label: 'Country (ISO)', type: 'text', default: 'FR' },
      {
        key: 'claims',
        label: 'Claims to issue',
        type: 'select',
        options: ['KYC', 'KYC + AML', 'KYC + AML + Accreditation'],
        default: 'KYC + AML + Accreditation',
        advanced: true,
      },
      { key: 'expiry', label: 'Claim validity', type: 'number', default: 365, suffix: 'days', advanced: true },
    ],
    describe: (p) => `Register ${String(p.investor).slice(0, 8)}… (${p.type})`,
    simulate: (p) => ({
      output: `Onboarded ${String(p.investor).slice(0, 8)}… → ONCHAINID created, ${p.claims} claims issued (valid ${p.expiry}d), added to identity registry as ${p.type}/${p.country} (ERC-3643, simulated)`,
      vars: { investor: String(p.investor).slice(0, 10) },
    }),
  },
  {
    type: 'primarysale',
    label: 'Primary sale',
    category: 'rwa',
    icon: 'cart',
    params: [
      { key: 'asset', label: 'Asset', type: 'text', default: 'Singapore Office #12' },
      { key: 'shares', label: 'Shares offered', type: 'number', default: 2000 },
      { key: 'price', label: 'Price per share', type: 'number', default: 50, suffix: '$' },
      { key: 'payToken', label: 'Accept', type: 'select', options: ['USDC', 'USDT', 'CSPR'], default: 'USDC' },
      { key: 'softCap', label: 'Soft cap', type: 'number', default: 50000, suffix: '$', advanced: true },
      { key: 'hardCap', label: 'Hard cap', type: 'number', default: 100000, suffix: '$', advanced: true },
      { key: 'closeDays', label: 'Offering window', type: 'number', default: 30, suffix: 'days', advanced: true },
      {
        key: 'compliance',
        label: 'Compliance check',
        type: 'select',
        options: ['Required per buyer', 'Off'],
        default: 'Required per buyer',
        advanced: true,
      },
    ],
    describe: (p) => `Sell ${p.shares} × "${trunc(String(p.asset), 14)}"`,
    simulate: (p) => {
      const raise = Number(p.shares) * Number(p.price)
      return {
        output: `Primary offering open: ${Number(p.shares).toLocaleString('en-US')} shares of "${p.asset}" @ $${p.price} in ${p.payToken} (target $${raise.toLocaleString('en-US')}). Each subscription gated by compliance, allocations minted to verified investors (simulated)`,
        vars: { raise, asset: String(p.asset) },
      }
    },
  },
  {
    type: 'freeze',
    label: 'Freeze / unfreeze',
    category: 'rwa',
    icon: 'snowflake2',
    params: [
      { key: 'account', label: 'Account (public key)', type: 'text', default: '02c4d6…a1b9' },
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        options: ['Freeze fully', 'Freeze partial amount', 'Unfreeze'],
        default: 'Freeze fully',
      },
      { key: 'amount', label: 'Amount (partial)', type: 'number', default: 0, suffix: 'tokens', advanced: true },
      { key: 'reason', label: 'Reason / case ref', type: 'text', default: 'Sanctions screening hit', advanced: true },
    ],
    describe: (p) => `${p.action} · ${String(p.account).slice(0, 8)}…`,
    simulate: (p) => ({
      output: `${p.action} on ${String(p.account).slice(0, 8)}… (${p.reason}) — enforced on-chain by the token agent (ERC-3643 freeze, simulated)`,
      vars: { account: String(p.account).slice(0, 10) },
    }),
  },
  {
    type: 'forcetransfer',
    label: 'Force transfer (recovery)',
    category: 'rwa',
    icon: 'arrow-force',
    params: [
      { key: 'from', label: 'From (public key)', type: 'text', default: '02lost…0000' },
      { key: 'to', label: 'To (public key)', type: 'text', default: '02new…a1b9' },
      { key: 'amount', label: 'Amount', type: 'number', default: 100, suffix: 'tokens' },
      {
        key: 'reason',
        label: 'Legal basis',
        type: 'select',
        options: ['Lost wallet recovery', 'Court order', 'Inheritance / estate', 'Erroneous transfer'],
        default: 'Lost wallet recovery',
        advanced: true,
      },
    ],
    describe: (p) => `Force ${p.amount} ${String(p.from).slice(0, 6)}…→${String(p.to).slice(0, 6)}…`,
    simulate: (p) => ({
      output: `Forced transfer of ${p.amount} tokens ${String(p.from).slice(0, 6)}… → ${String(p.to).slice(0, 6)}… (${p.reason}). Agent-authorized recovery, recipient must be compliance-cleared (ERC-3643 forcedTransfer, simulated)`,
      vars: { amount: Number(p.amount) },
    }),
  },
  {
    type: 'pausetoken',
    label: 'Pause / unpause token',
    category: 'rwa',
    icon: 'pause',
    params: [
      { key: 'asset', label: 'Token / asset', type: 'text', default: 'Singapore Office #12' },
      { key: 'action', label: 'Action', type: 'select', options: ['Pause all transfers', 'Unpause'], default: 'Pause all transfers' },
      { key: 'reason', label: 'Reason', type: 'text', default: 'Regulatory hold', advanced: true },
    ],
    describe: (p) => `${p.action}`,
    simulate: (p) => ({
      output: `${p.action} for "${p.asset}" (${p.reason}) — all holder transfers ${String(p.action).startsWith('Pause') ? 'halted' : 'resumed'} at the token level (simulated)`,
    }),
  },
  {
    type: 'corporate',
    label: 'Corporate action',
    category: 'rwa',
    icon: 'corporate',
    params: [
      {
        key: 'type',
        label: 'Action type',
        type: 'select',
        options: ['Share split', 'Reverse split', 'Buyback', 'Redemption at maturity'],
        default: 'Buyback',
      },
      { key: 'ratio', label: 'Ratio / amount', type: 'text', default: '2:1' },
      { key: 'price', label: 'Price (buyback/redeem)', type: 'number', default: 55, suffix: '$', advanced: true },
    ],
    describe: (p) => `${p.type} · ${p.ratio}`,
    simulate: (p) => ({
      output: `Corporate action "${p.type}" (${p.ratio}) executed across all holders pro-rata${String(p.type).match(/Buyback|Redemption/) ? ` at $${p.price}/share` : ''}, cap table updated atomically (simulated)`,
    }),
  },
  {
    type: 'capitalcall',
    label: 'Capital call',
    category: 'rwa',
    icon: 'capital-call',
    params: [
      { key: 'fund', label: 'Fund / vehicle', type: 'text', default: 'Real Estate Fund I' },
      { key: 'pct', label: 'Call', type: 'number', default: 25, suffix: '% of commitment' },
      { key: 'payToken', label: 'Payable in', type: 'select', options: ['USDC', 'USDT'], default: 'USDC' },
      { key: 'dueDays', label: 'Due within', type: 'number', default: 14, suffix: 'days', advanced: true },
    ],
    describe: (p) => `Call ${p.pct}% · ${trunc(String(p.fund), 14)}`,
    simulate: (p) => ({
      output: `Capital call issued for "${p.fund}": ${p.pct}% of committed capital due in ${p.dueDays}d, payable in ${p.payToken}. Notices sent to all LPs, on-chain escrow tracks fulfilment (simulated)`,
      vars: { callPct: Number(p.pct) },
    }),
  },
  {
    type: 'nav',
    label: 'NAV / valuation update',
    category: 'rwa',
    icon: 'nav',
    params: [
      { key: 'asset', label: 'Asset', type: 'text', default: 'Singapore Office #12' },
      { key: 'navPerShare', label: 'New NAV per share', type: 'number', default: 52.4, suffix: '$' },
      {
        key: 'source',
        label: 'Valuation source',
        type: 'select',
        options: ['Independent appraiser', 'Styks oracle', 'Manual / board'],
        default: 'Independent appraiser',
        advanced: true,
      },
    ],
    describe: (p) => `NAV $${p.navPerShare}/share`,
    simulate: (p) => ({
      output: `NAV updated for "${p.asset}": $${p.navPerShare}/share (source: ${p.source}). Published on-chain so holders and DeFi protocols price the asset correctly (simulated)`,
      vars: { nav: Number(p.navPerShare) },
    }),
  },
  {
    type: 'rwareport',
    label: 'Compliance report',
    category: 'rwa',
    icon: 'report',
    params: [
      {
        key: 'type',
        label: 'Report',
        type: 'select',
        options: ['Cap table snapshot', 'Transfer audit trail', 'Investor statement', 'Regulatory filing'],
        default: 'Transfer audit trail',
      },
      { key: 'period', label: 'Period', type: 'select', options: ['This month', 'This quarter', 'Year to date'], default: 'This quarter' },
      {
        key: 'recipient',
        label: 'Send to',
        type: 'select',
        options: ['Issuer', 'Auditor', 'Regulator'],
        default: 'Auditor',
        advanced: true,
      },
    ],
    describe: (p) => `${p.type} · ${p.period}`,
    simulate: (p) => ({
      output: `Generated "${p.type}" for ${p.period} from the on-chain record (every transfer carries a verifiable signature trail) → delivered to ${p.recipient ?? 'auditor'} (simulated)`,
    }),
  },
  {
    type: 'notify',
    label: 'Notification',
    category: 'output',
    icon: 'bell',
    params: [
      { key: 'channel', label: 'Channel', type: 'select', options: ['Telegram', 'Email'], default: 'Telegram' },
      { key: 'message', label: 'Message', type: 'text', default: 'CSPR is at ${{price}} — your agent acted at {{time}}' },
    ],
    describe: (p) => `${p.channel}: "${trunc(String(p.message))}"`,
    simulate: async (p, ctx) => {
      if (p.channel === 'Telegram' && ctx.telegramToken && ctx.telegramChatId) {
        const ok = await sendTelegram(ctx.telegramToken, ctx.telegramChatId, String(p.message))
        return ok
          ? { output: `Telegram delivered: "${p.message}" — REAL message sent` }
          : { output: 'Telegram failed — check bot token & chat ID in Settings', pass: false }
      }
      return {
        output: `${p.channel} sent: "${p.message}" (simulated — connect ${p.channel} in Settings)`,
      }
    },
  },
  {
    type: 'discord',
    label: 'Discord message',
    category: 'output',
    icon: 'message',
    params: [
      { key: 'webhook', label: 'Webhook URL', type: 'text', default: 'discord.com/api/webhooks/…' },
      { key: 'message', label: 'Message', type: 'text', default: 'Agent report: action taken' },
    ],
    describe: (p) => `Discord: "${trunc(String(p.message))}"`,
    simulate: async (p, ctx) => {
      const url = isDiscordWebhook(String(p.webhook))
        ? String(p.webhook)
        : ctx.discordWebhook && isDiscordWebhook(ctx.discordWebhook)
          ? ctx.discordWebhook
          : null
      if (url) {
        const ok = await sendDiscord(url, String(p.message))
        return ok
          ? { output: `Discord delivered: "${p.message}" — REAL message sent` }
          : { output: 'Discord failed — check the webhook URL', pass: false }
      }
      return {
        output: `Discord posted: "${p.message}" (simulated — paste a webhook URL on the card or in Settings)`,
      }
    },
  },
  {
    type: 'webhook',
    label: 'HTTP webhook',
    category: 'output',
    icon: 'link',
    params: [
      { key: 'url', label: 'POST to URL', type: 'text', default: 'https://example.com/hook' },
    ],
    describe: (p) => trunc(String(p.url), 30),
    simulate: (p) => ({
      output: `POST sent to ${p.url} with run payload (simulated)`,
    }),
  },
]

export const moduleByType = (type: string) => MODULES.find((m) => m.type === type)

export const defaultParams = (def: ModuleDef): Params =>
  Object.fromEntries(def.params.map((p) => [p.key, p.default]))
