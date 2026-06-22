import type { Node, Edge } from '@xyflow/react'
import { moduleByType, defaultParams, type Params } from './modules'

export interface AgentTemplate {
  id: string
  name: string
  icon: string
  tagline: string
  description: string
  build: () => { nodes: Node[]; edges: Edge[] }
}

interface Spec {
  type: string
  params?: Params
  branch?: number // row index for parallel branches (default 0)
}

// Build a left-to-right chain from AI/specs, keeping only valid module types.
export function buildFromSpecs(
  specs: { type: string; params?: Params }[],
): { nodes: Node[]; edges: Edge[] } {
  const valid = specs.filter((s) => moduleByType(s.type))
  const flow = buildChain(valid.map((s) => ({ type: s.type, params: s.params })))
  autoFixGeneratedFlow(flow.nodes, flow.edges)
  return flow
}

// Actions that move funds — the only ones an AI node should be allowed to gate.
const SIGNABLE_TYPES = new Set(['transfer', 'stake', 'callcontract', 'swap', 'x402', 'deploytoken', 'deploynft', 'mintnft'])

// Does following the edges out of `start` eventually reach a node matching `pred`?
function reachesDownstream(
  start: string,
  edges: Edge[],
  pred: (id: string) => boolean,
): boolean {
  const adj = new Map<string, string[]>()
  edges.forEach((e) => {
    const list = adj.get(e.source) ?? []
    list.push(e.target)
    adj.set(e.source, list)
  })
  const seen = new Set<string>()
  const stack = [...(adj.get(start) ?? [])]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    if (pred(id)) return true
    for (const t of adj.get(id) ?? []) stack.push(t)
  }
  return false
}

// Deterministically repair common mistakes the LLM makes when generating a flow,
// so the user never has to open a card and fix parameters by hand.
export function autoFixGeneratedFlow(nodes: Node[], edges: Edge[]): void {
  const typeOf = (id: string) =>
    (nodes.find((n) => n.id === id)?.data as { moduleType?: string } | undefined)?.moduleType ?? ''

  // 1) AI gating. An AI node should only STOP the branch when it actually gates a
  //    money action downstream (a real guardian). A summary / logging AI that does
  //    NOT lead to a payment must "Continue anyway", or it could randomly halt the
  //    flow before the attestation or notification.
  for (const n of nodes) {
    const data = n.data as { moduleType?: string; params?: Params }
    if (data.moduleType !== 'ai') continue
    const gatesPayment = reachesDownstream(n.id, edges, (id) => SIGNABLE_TYPES.has(typeOf(id)))
    if (!gatesPayment) {
      // A non-gating AI is a summarizer / generator — run it in text mode so it
      // produces real text instead of a misleading yes/no, and never blocks.
      data.params = { ...(data.params ?? {}), mode: 'Generate text', onNo: 'Continue anyway' }
    } else {
      data.params = { ...(data.params ?? {}), mode: 'Decision (yes / no)' }
    }
  }

  // 1b) Read balance always reads the connected wallet — reset the account to the
  //     wallet variable so the generator can't inject a malformed address.
  for (const n of nodes) {
    const data = n.data as { moduleType?: string; params?: Params }
    if (data.moduleType !== 'readbalance') continue
    data.params = { ...(data.params ?? {}), account: '{{walletpublic}}' }
  }

  // 2) Attestation content. If the text to attest carries no {{variable}}, it would
  //    anchor a meaningless static string. Inject the real AI verdict(s) so the
  //    on-chain EIP-712 hash actually contains what the agent decided.
  const aiCount = nodes.filter(
    (n) => (n.data as { moduleType?: string }).moduleType === 'ai',
  ).length
  for (const n of nodes) {
    const data = n.data as { moduleType?: string; params?: Params }
    if (data.moduleType !== 'attest') continue
    data.params = { ...(data.params ?? {}) }
    const current = String(data.params.data ?? '')
    if (!current.includes('{{')) {
      data.params.data =
        aiCount >= 2
          ? 'AI decision {{aidecision}}: {{ai}} | summary: {{ai2}} at {{time}}'
          : aiCount === 1
            ? 'AI decision {{aidecision}}: {{ai}} at {{time}}'
            : '{{topic}} at {{time}}'
    }
    // Anchor transfers must respect Casper's 2.5 CSPR native-transfer minimum.
    if (Number(data.params.amount) < 2.5) data.params.amount = 2.5
  }

  // 3) Variable normalization. The LLM sometimes invents {{variable}} names the
  //    app can't resolve (e.g. {{settlement_hash}}), which would render as raw
  //    braces. Map the common invented names onto the real ones.
  const VAR_ALIASES: Record<string, string> = {
    settlement_hash: 'hash', settlementhash: 'hash', tx: 'hash', txhash: 'hash',
    tx_hash: 'hash', transaction: 'hash', transaction_hash: 'hash', deploy_hash: 'hash',
    deployhash: 'hash', txid: 'hash', transferhash: 'hash',
    tx_url: 'txurl', txlink: 'txurl', link: 'txurl', explorer: 'txurl',
    explorerlink: 'txurl', explorer_url: 'txurl', proof: 'txurl', proof_link: 'txurl', url: 'txurl',
    cspr_price: 'price', csprprice: 'price', token_price: 'price',
    wallet_balance: 'balance', walletbalance: 'balance',
    verdict: 'aidecision', decision: 'aidecision', summary: 'ai', recipient: 'to', sender: 'from',
  }
  for (const n of nodes) {
    const data = n.data as { params?: Params }
    if (!data.params) continue
    for (const [k, v] of Object.entries(data.params)) {
      if (typeof v !== 'string' || !v.includes('{{')) continue
      data.params[k] = v.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, name) => {
        const canon = VAR_ALIASES[String(name).toLowerCase()]
        return canon ? `{{${canon}}}` : whole
      })
    }
  }

  // 4) Snap select params onto a valid option (the LLM may return a near-miss
  //    like "below" instead of "goes below", or a wrong casing).
  for (const n of nodes) {
    const data = n.data as { moduleType?: string; params?: Params }
    const def = moduleByType(data.moduleType ?? '')
    if (!def || !data.params) continue
    for (const p of def.params) {
      if (p.type !== 'select' || !p.options) continue
      const cur = data.params[p.key]
      if (cur == null || cur === '') continue
      const curS = String(cur).toLowerCase().trim()
      if (p.options.some((o) => o.toLowerCase() === curS)) continue // already valid
      const fuzzy = p.options.find(
        (o) => o.toLowerCase().includes(curS) || curS.includes(o.toLowerCase()),
      )
      data.params[p.key] = fuzzy ?? p.default
    }
  }

  // 5) x402 response check: the LLM sometimes sets verifyContains to a generic
  //    word like "success" that won't appear in a real response, which would
  //    reject every valid result. Clear those guesses (the user can set a real
  //    keyword by hand).
  const GENERIC_VERIFY = new Set(['success', 'ok', 'true', 'valid', 'done', 'status', '200', 'verified'])
  for (const n of nodes) {
    const data = n.data as { moduleType?: string; params?: Params }
    if (data.moduleType !== 'x402' || !data.params) continue
    const vc = String(data.params.verifyContains ?? '').trim().toLowerCase()
    if (vc && GENERIC_VERIFY.has(vc)) data.params.verifyContains = ''
  }

  // 6) Parallelize sibling transfers. The LLM emits a payroll (or any multi-payout)
  //    as one long series P → t1 → t2 → … → tk → S. Those are independent payments:
  //    they should fan OUT from the node before them and fan IN to the node after,
  //    so they read — and lay out — as parallel branches instead of a chain. We only
  //    touch 'transfer' nodes so intentional sequences of other actions are untouched.
  parallelizeTransferRuns(nodes, edges)
}

// Rewire any maximal simple chain of ≥2 'transfer' nodes into a fan-out / fan-in
// between the single node before the run and the single node after it. The run
// engine dedups merge nodes (visited set) and BFS runs every sibling before the
// merge, so this is execution-safe; tidy() then stacks the siblings in one column.
function parallelizeTransferRuns(nodes: Node[], edges: Edge[]): void {
  const typeOf = (id: string) =>
    (nodes.find((n) => n.id === id)?.data as { moduleType?: string } | undefined)?.moduleType ?? ''
  const isTransfer = (id: string) => typeOf(id) === 'transfer'
  const outOf = (id: string) => edges.filter((e) => e.source === id)
  const inOf = (id: string) => edges.filter((e) => e.target === id)

  const visited = new Set<string>()
  const runs: string[][] = []
  for (const n of nodes) {
    if (!isTransfer(n.id) || visited.has(n.id)) continue
    const ins = inOf(n.id)
    const pred = ins.length === 1 ? ins[0].source : null
    // A run starts at a transfer whose predecessor is not itself a transfer.
    if (pred && isTransfer(pred)) continue
    const run: string[] = []
    let cur: string | null = n.id
    while (cur && isTransfer(cur) && !visited.has(cur)) {
      run.push(cur)
      visited.add(cur)
      const outs = outOf(cur)
      if (outs.length !== 1) break
      const next = outs[0].target
      cur = isTransfer(next) && inOf(next).length === 1 && !visited.has(next) ? next : null
    }
    if (run.length >= 2) runs.push(run)
  }

  for (const run of runs) {
    const first = run[0]
    const last = run[run.length - 1]
    const preds = inOf(first)
    const succs = outOf(last)
    const P = preds.length === 1 ? preds[0].source : null
    const S = succs.length === 1 ? succs[0].target : null
    if (!P) continue // need a single upstream gate to fan out from
    const runSet = new Set(run)
    const keep = edges.filter((e) => {
      if (runSet.has(e.source) && runSet.has(e.target)) return false // internal links
      if (e.source === P && e.target === first) return false // rebuilt as fan-out
      if (S && e.source === last && e.target === S) return false // rebuilt as fan-in
      return true
    })
    const mk = (s: string, t: string): Edge => ({
      id: `e${s}-${t}`,
      source: s,
      target: t,
      animated: true,
      interactionWidth: 14,
    })
    for (const t of run) keep.push(mk(P, t)) // fan out
    if (S) for (const t of run) keep.push(mk(t, S)) // fan in
    edges.length = 0
    edges.push(...keep)
  }
}

// Build a left-to-right chain (or parallel branches sharing the first trigger).
function buildChain(specs: Spec[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const colX = 400
  const rowY = 240
  const perBranchCol: Record<number, number> = {}
  let i = 1
  const idOf = (n: number) => `n${n}`
  const byBranchLast: Record<number, string | null> = {}

  specs.forEach((s) => {
    const def = moduleByType(s.type)
    if (!def) return
    const branch = s.branch ?? 0
    const col = perBranchCol[branch] ?? (branch === 0 ? 0 : 1)
    perBranchCol[branch] = col + 1
    const id = idOf(i++)
    nodes.push({
      id,
      type: 'module',
      position: { x: 60 + col * colX, y: 80 + branch * rowY },
      data: { moduleType: s.type, params: { ...defaultParams(def), ...(s.params ?? {}) } },
    })
    const prev = byBranchLast[branch] ?? (branch !== 0 ? byBranchLast[0] : null)
    if (prev) {
      edges.push({
        id: `e${prev}-${id}`,
        source: prev,
        target: id,
        animated: true,
        interactionWidth: 14,
      })
    }
    byBranchLast[branch] = id
  })
  return { nodes, edges }
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'blank',
    name: 'Blank canvas',
    icon: 'note',
    tagline: 'Start from scratch',
    description: 'An empty workspace. Drag actions from the palette to build your own agent.',
    build: () => ({ nodes: [], edges: [] }),
  },
  {
    id: 'treasury-agent',
    name: 'Autonomous treasury agent',
    icon: 'sparkles',
    tagline: 'Describe a goal, it acts on Casper',
    description:
      'A ready-to-use autonomous agent, already wired to a wallet and a spend limit. Just connect your wallet and write what you want it to do in plain English — it picks the tools it needs by itself. Safe defaults: it asks for your approval before signing, and never spends above the cap.',
    build: () =>
      buildChain([
        { type: 'wallet', params: { mode: 'manual' } },
        { type: 'spendlimit', params: { max: 10, window: 'This run' } },
        {
          type: 'agent',
          params: {
            role: 'Autonomous treasury operator',
            goal:
              "Check the connected wallet's balance and the current CSPR price, then summarize what you see in one sentence.",
            toolsMode: 'auto',
            maxSteps: 8,
          },
        },
      ]),
  },
  {
    id: 'sentinel',
    name: 'CSPR Sentinel',
    icon: 'trending',
    tagline: 'Price alert to your phone',
    description:
      'Checks the live CSPR price every 5 minutes and sends you a Telegram message when it crosses your threshold. The perfect first agent.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'price', params: { mode: 'goes below', threshold: 0.02 } },
        { type: 'notify', params: { message: 'CSPR dropped to ${{price}} at {{time}}' } },
      ]),
  },
  {
    id: 'dca',
    name: 'DCA Accumulator',
    icon: 'coin',
    tagline: 'Buy a little, regularly',
    description:
      'Buys a fixed dollar amount of CSPR on every run, smoothing out volatility. Set the Schedule to weekly for classic dollar-cost averaging.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'dca', params: { spend: 50 } },
        { type: 'notify', params: { message: 'DCA done — bought ~{{cspr}} CSPR' } },
      ]),
  },
  {
    id: 'protector',
    name: 'Stop-loss Protector',
    icon: 'shield-dollar',
    tagline: 'Protect your value automatically',
    description:
      'Watches your entry price and moves your CSPR into a stablecoin if it falls past your stop level — capping your downside while you sleep. Add an approval step for large positions.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'stoploss', params: { entry: 0.02, drop: 5, amount: 1000 } },
        { type: 'notify', params: { message: 'Stop-loss triggered — protected {{net}} USDC' } },
      ]),
  },
  {
    id: 'compounder',
    name: 'Staking Compounder',
    icon: 'percent',
    tagline: 'Compound rewards on autopilot',
    description:
      'Every week, claims your staking rewards and re-delegates them automatically — compound interest at ~11% APY with no manual work.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'compound', params: { staked: 10000, minRewards: 50 } },
        { type: 'notify', params: { message: 'Compounded {{rewards}} CSPR back into staking' } },
      ]),
  },
  {
    id: 'sniper',
    name: 'Launch Sniper',
    icon: 'rocket',
    tagline: 'Catch new token launches',
    description:
      'Watches Ghostminter for new token launches and instantly alerts you on Telegram and Discord — be first to know.',
    build: () =>
      buildChain([
        { type: 'launchwatch' },
        { type: 'notify', params: { message: 'New launch: {{token}} on Ghostminter' } },
        { type: 'discord', params: { message: 'New launch: {{token}} — take a look' } },
      ]),
  },
  {
    id: 'hedger',
    name: 'Downturn Hedger',
    icon: 'candles',
    tagline: 'Short instead of selling',
    description:
      'If CSPR falls below your level, opens a SHORT perpetual on Casper Delta to offset losses — you keep your stack and profit from the dip. Advanced.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'price', params: { mode: 'goes below', threshold: 0.02 } },
        { type: 'perp', params: { side: 'SHORT', size: 100, leverage: 3 } },
        { type: 'notify', params: { message: 'Hedge opened: SHORT at ${{price}}' } },
      ]),
  },
  {
    id: 'rentdistributor',
    name: 'Rent Distributor (RWA)',
    icon: 'building',
    tagline: 'Fractional real estate income',
    description:
      'When rent arrives, splits it pro-rata across all token holders of a tokenized property — automated, instant, no intermediary. The fractional real-estate use case from Casper’s RWA vision, no-code.',
    build: () =>
      buildChain([
        { type: 'incoming', params: { min: 100 } },
        { type: 'distribute', params: { kind: 'Rent', amount: 1000, holders: 25 } },
        { type: 'notify', params: { message: 'Rent distributed: {{distributed}} CSPR to {{holders}} holders' } },
      ]),
  },
  {
    id: 'complianttransfer',
    name: 'Compliant Transfer (RWA)',
    icon: 'shield-check',
    tagline: 'KYC-gated security token',
    description:
      'Before sending a security token, checks the recipient is KYC-verified and in an allowed jurisdiction (ERC-3643). Blocks non-compliant transfers automatically — institutional-grade by default.',
    build: () =>
      buildChain([
        { type: 'incoming', params: { min: 1 } },
        { type: 'compliance', params: { jurisdiction: 'EU (MiCA)', require: 'KYC verified' } },
        { type: 'transfer', params: { amount: 100 } },
        { type: 'notify', params: { message: 'Compliant transfer cleared and settled' } },
      ]),
  },
  {
    id: 'agentservice',
    name: 'Agent Service (x402)',
    icon: 'broadcast',
    tagline: 'Sell a service to other agents',
    description:
      'Publishes a paid data service that other AI agents call and pay for per request via x402 — the machine economy in action. Your workflow earns CSPR automatically.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'x402offer', params: { service: 'CSPR price feed', price: 0.003, path: '/api/price' } },
        { type: 'notify', params: { message: 'Service live — earned {{earned}} CSPR this cycle' } },
      ]),
  },
  {
    id: 'aitrader',
    name: 'AI Trader',
    icon: 'sparkles',
    tagline: 'Let the AI decide',
    description:
      'Checks the price, asks your AI model whether to act on the current context, and only swaps if the model says yes. Connect a model in Settings → AI.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'price', params: { mode: 'goes below', threshold: 0.02 } },
        { type: 'ai', params: { instruction: 'Given the live price, is this a good entry?' } },
        { type: 'dca', params: { spend: 50 } },
        { type: 'notify', params: { message: 'AI approved — bought ~{{cspr}} CSPR at ${{price}}' } },
      ]),
  },
  {
    id: 'verifiable-agent',
    name: '★ Verifiable Agent (Attest)',
    icon: 'certificate',
    tagline: 'Every decision proven on Casper',
    description:
      'The pattern behind most of the top buildathon projects, in no-code: the agent reads the live price, asks the AI to judge it, then ANCHORS a standards-compliant EIP-712 attestation of that decision on Casper testnet — auditable by anyone — and notifies you with the proof link. Add a Wallet node and enable live execution to anchor for real.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { repeat: 'Repeat every', interval: 5, unit: 'minutes' } },
        { type: 'wallet', params: { mode: 'autonomous' } },
        { type: 'ai', params: { instruction: 'Given the live CSPR price, should the agent act now?' } },
        { type: 'attest', params: { topic: 'agent-decision', data: 'AI verdict on CSPR at ${{price}} ({{time}})' } },
        { type: 'notify', params: { message: 'Decision attested on Casper · proof {{claimhash}}' } },
      ]),
  },
  {
    id: 'token-launchpad',
    name: '★ Token Launchpad (CEP-18)',
    icon: 'coin',
    tagline: 'Deploy a token, no Rust',
    description:
      'No-code token issuance: pick the name, symbol, supply and behaviour (fixed vs mintable/burnable, on-chain events) from dropdowns, and the agent deploys a real CEP-18 fungible token on Casper — then alerts you with the contract link. Add the CEP-18 wasm to /public and enable live execution to deploy for real.',
    build: () =>
      buildChain([
        { type: 'wallet', params: { mode: 'autonomous' } },
        {
          type: 'deploytoken',
          params: { name: 'Demo Token', symbol: 'DEMO', decimals: 9, supply: 1000000, mintable: 'Mintable / burnable' },
        },
        { type: 'notify', params: { message: 'Token {{symbol}} deployed on Casper · {{txurl}}' } },
      ]),
  },
  {
    id: 'nft-launchpad',
    name: '★ NFT Launchpad (CEP-78)',
    icon: 'image',
    tagline: 'Configurable collection, no Rust',
    description:
      'The "semi-automatic contract": choose ownership (transferable / soulbound), who can mint, mutable or immutable metadata and whether it is burnable — all from dropdowns — and the agent deploys a real CEP-78 NFT collection on Casper, then mints the first NFT. Add the CEP-78 wasm to /public and enable live execution to deploy for real.',
    build: () =>
      buildChain([
        { type: 'wallet', params: { mode: 'autonomous' } },
        {
          type: 'deploynft',
          params: { name: 'Demo Collection', symbol: 'DEMO', supply: 1000, ownership: 'Transferable', minting: 'Only me (installer)', metadata: 'Immutable', burnable: 'Yes' },
        },
        { type: 'notify', params: { message: 'Collection {{symbol}} deployed on Casper · {{txurl}}' } },
      ]),
  },
  {
    id: 'capped-treasury',
    name: '★ Capped Treasury (Spend limit)',
    icon: 'shield-dollar',
    tagline: 'Autonomous, but budget-bounded',
    description:
      'A guardrailed agent: a Spend limit caps how much CSPR it can ever move per day, the AI decides whether to act, it pays a data service via x402 (verifying the response before trusting it), and produces a verifiable on-chain receipt. The safe pattern for autonomous payments.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { repeat: 'Repeat every', interval: 5, unit: 'minutes' } },
        { type: 'wallet', params: { mode: 'autonomous' } },
        { type: 'spendlimit', params: { max: 10, window: 'Day' } },
        { type: 'ai', params: { instruction: 'Given the live CSPR price, is it worth buying a fresh data signal now?' } },
        { type: 'x402', params: { endpoint: 'http://localhost:4021/premium', maxPrice: 3, minLength: 8 } },
        { type: 'receipt', params: { title: 'Data purchase receipt' } },
        { type: 'notify', params: { message: 'Signal bought within budget · receipt {{hash}}' } },
      ]),
  },

  // ── Showcase templates — rich, branching agents made for screenshots ──
  {
    id: 'showcase-treasury',
    name: '★ Smart Treasury — Showcase',
    icon: 'shield-dollar',
    tagline: 'Multi-branch DeFi + AI guardian',
    description:
      'A rich two-branch agent: every 5 min it reads the live price, asks the AI to judge the situation, then in parallel protects with a stop-loss (→ Telegram) and compounds staking rewards (→ Discord). Great hero screenshot showing branching, AI and DeFi together.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'price', params: { mode: 'goes below', threshold: 0.018 } },
        { type: 'ai', params: { instruction: 'Is this dip worth acting on?' } },
        { type: 'stoploss', params: { entry: 0.02, drop: 5, amount: 1000 }, branch: 1 },
        { type: 'notify', params: { message: 'Stop-loss fired — protected {{net}} USDC' }, branch: 1 },
        { type: 'compound', params: { staked: 10000, minRewards: 50 }, branch: 2 },
        { type: 'discord', params: { message: 'Compounded {{rewards}} CSPR back into staking' }, branch: 2 },
      ]),
  },
  {
    id: 'showcase-desk',
    name: '★ AI Trading Desk — Showcase',
    icon: 'sparkles',
    tagline: 'Oracle → AI → safety → swap',
    description:
      'A deep linear agent: on-chain oracle price → AI decision → token safety screen → CSPR.trade swap → notification. Shows the full decision pipeline a serious trader would build, all no-code.',
    build: () =>
      buildChain([
        { type: 'schedule', params: { interval: 5 } },
        { type: 'oracle', params: { mode: 'goes below', threshold: 0.018 } },
        { type: 'ai', params: { instruction: 'Good entry given the trend and context?' } },
        { type: 'safety', params: {} },
        { type: 'swap', params: { pair: 'CSPR → sCSPR', amount: 200 } },
        { type: 'notify', params: { message: 'AI + safety cleared — bought CSPR at ${{price}}' } },
      ]),
  },
  {
    id: 'showcase-machine',
    name: '★ Machine Economy — Showcase',
    icon: 'broadcast',
    tagline: 'RWA income + agent-to-agent',
    description:
      'Casper’s thesis in one agent: when rent arrives, run a compliance check, distribute income to all token holders, publish a paid x402 data service other agents pay for, and notify. Shows RWA + the machine economy together.',
    build: () =>
      buildChain([
        { type: 'incoming', params: { min: 100 } },
        { type: 'compliance', params: { jurisdiction: 'EU (MiCA)' } },
        { type: 'distribute', params: { kind: 'Rent', amount: 1000, holders: 25 } },
        { type: 'x402offer', params: { service: 'Yield data feed', price: 0.003 } },
        { type: 'notify', params: { message: 'Distributed {{distributed}} CSPR to {{holders}} holders' } },
      ]),
  },
]
