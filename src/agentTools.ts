import type { AgentToolSpec } from './ai'

// The catalog of tools an Autonomous Agent can be given. These are SPECS only
// (name, description, JSON schema). Execution is wired in App.tsx (executeTool)
// against the real Casper functions, under the spend-limit and confirm guardrails.
export interface AgentToolDef {
  id: string
  label: string // human label for the tool picker
  signs: boolean // true if it moves funds / signs a transaction
  spec: AgentToolSpec
}

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    id: 'read_balance',
    label: 'Read balance',
    signs: false,
    spec: {
      name: 'read_balance',
      description:
        "Read the live on-chain CSPR balance of an account. Defaults to the agent's own wallet if no account is given.",
      parameters: {
        type: 'object',
        properties: {
          account: {
            type: 'string',
            description: 'Public key, account hash, or saved wallet name. Optional.',
          },
        },
      },
    },
  },
  {
    id: 'get_price',
    label: 'Get CSPR price',
    signs: false,
    spec: {
      name: 'get_price',
      description: 'Get the current CSPR price in USD.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    id: 'recent_transfers',
    label: 'Read recent transfers',
    signs: false,
    spec: {
      name: 'recent_transfers',
      description:
        'List the recent transfers of an account (incoming and outgoing). Defaults to the agent wallet.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Optional account.' },
          limit: { type: 'number', description: 'How many to return, default 10.' },
        },
      },
    },
  },
  {
    id: 'resolve_name',
    label: 'Resolve CSPR.name',
    signs: false,
    spec: {
      name: 'resolve_name',
      description: 'Resolve a CSPR.name (for example alice.cspr) to an account hash.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'The name, e.g. alice.cspr' } },
        required: ['name'],
      },
    },
  },
  {
    id: 'decide',
    label: 'Decide / gate',
    signs: false,
    spec: {
      name: 'decide',
      description:
        'Make a single yes/no decision about whether the flow should proceed. Call this once, at the end, with your verdict and a one-sentence reason. A "no" can stop the flow here (a guardrail the user configured).',
      parameters: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['yes', 'no'], description: 'yes to proceed, no to stop' },
          reason: { type: 'string', description: 'One short sentence explaining the verdict.' },
        },
        required: ['verdict'],
      },
    },
  },
  {
    id: 'notify',
    label: 'Message me',
    signs: false,
    spec: {
      name: 'notify',
      description:
        'Send a short message to the user on their configured channel (Telegram or Discord). Use it to report what you did, including any proof link.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string', description: 'The message to send.' } },
        required: ['message'],
      },
    },
  },
  {
    id: 'send_cspr',
    label: 'Send CSPR',
    signs: true,
    spec: {
      name: 'send_cspr',
      description:
        'Sign and submit a real CSPR transfer. Always subject to the spend-limit and confirmation guardrails, so a call may be blocked or need approval.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient public key, account hash, CSPR.name, or saved wallet name.',
          },
          amount: { type: 'number', description: 'Amount in CSPR (minimum 2.5).' },
          memo: { type: 'string', description: 'Optional note.' },
        },
        required: ['to', 'amount'],
      },
    },
  },
  {
    id: 'delegate',
    label: 'Stake (delegate)',
    signs: true,
    spec: {
      name: 'delegate',
      description: 'Sign and submit a real delegation (stake) of CSPR to a validator.',
      parameters: {
        type: 'object',
        properties: {
          validator: { type: 'string', description: 'Validator public key.' },
          amount: { type: 'number', description: 'CSPR to delegate.' },
        },
        required: ['validator', 'amount'],
      },
    },
  },
  {
    id: 'attest',
    label: 'Anchor proof (attest)',
    signs: true,
    spec: {
      name: 'attest',
      description:
        'Anchor a short note on Casper as a tamper-proof EIP-712 attestation, returning a verifiable explorer link. Use this to record a decision or a summary so it can be audited later.',
      parameters: {
        type: 'object',
        properties: { note: { type: 'string', description: 'The claim or decision to anchor.' } },
        required: ['note'],
      },
    },
  },
]

export const agentToolById = (id: string) => AGENT_TOOLS.find((t) => t.id === id)

// "Auto" mode: pick the tools an agent needs straight from its goal text, so a
// non-technical user doesn't have to choose them. Read-only tools (balance,
// price) are always on; signing tools are added only when the goal asks for the
// matching action. Generous selection is safe: unused tools are simply never
// called, and money-moving tools stay gated by the spend limit + approval.
export function inferToolsFromGoal(goal: string): string[] {
  const g = (goal || '').toLowerCase()
  const picked = new Set<string>(['read_balance', 'get_price'])
  if (/\b(send|sends|sending|sent|transfer|transfers|pay|pays|paying|payment|payroll|distribute|airdrop)\b/.test(g))
    picked.add('send_cspr')
  if (/\b(stake|stakes|staking|delegate|delegates|delegation|restake|validator)\b/.test(g))
    picked.add('delegate')
  // Only real anchoring words trigger attest. NOT bare "proof"/"note": "send me
  // the proof link" means the explorer link of a transfer, not an on-chain anchor.
  if (
    /\b(attest|attests|attestation|anchor|anchors|anchored|notari[sz]e|notari[sz]ed|certify|certifies|tamper.?proof)\b/.test(
      g,
    ) ||
    /\b(record|log)\s+(it|this|the\s+\w+)?\s*on(-|\s)?(chain|casper)\b/.test(g)
  )
    picked.add('attest')
  if (/(\.cspr|cspr\.name|resolve)\b/.test(g)) picked.add('resolve_name')
  if (/\b(history|recent|past|previous|last\s+\d+|activity)\b/.test(g)) picked.add('recent_transfers')
  if (/\b(notify|alert|message|ping|tell\s+me|let\s+me\s+know|warn\s+me|dm|telegram|discord|report\s+to)\b/.test(g))
    picked.add('notify')
  if (/\b(decide|should\s+(we|i|it)|only\s+if|approve|reject|gate|evaluate\s+whether|check\s+if|verify\s+(that|if|whether)|is\s+it\s+safe|allowed\s+to)\b/.test(g))
    picked.add('decide')
  // Keep the canonical order from AGENT_TOOLS.
  return AGENT_TOOLS.filter((t) => picked.has(t.id)).map((t) => t.id)
}

// Resolve a node's effective tools: inferred from the goal in 'auto' mode,
// otherwise the explicitly-picked list.
export function effectiveTools(
  mode: string | number | undefined,
  toolsParam: string | number | undefined,
  goal: string,
): AgentToolDef[] {
  if (String(mode ?? 'auto') === 'auto') {
    return inferToolsFromGoal(goal)
      .map(agentToolById)
      .filter((t): t is AgentToolDef => !!t)
  }
  return toolsFromParam(toolsParam)
}

// Suggested roles for the Autonomous Agent. Shown as a dropdown, but the field
// stays free-text so anyone can describe a custom role.
export const AGENT_ROLES = [
  'Autonomous treasury operator',
  'Analyst',
  'Executor',
  'Risk officer',
  'Compliance officer',
  'Payroll manager',
  'Portfolio manager',
  'Trader',
  'DCA bot',
  'Treasury monitor',
  'Auditor',
  'Yield manager',
  'Operations bot',
]

// Default tools for a new Autonomous Agent node.
export const DEFAULT_AGENT_TOOLS = ['read_balance', 'get_price', 'send_cspr', 'attest']

// Parse a node's stored tools param (comma-separated ids) into tool defs.
export function toolsFromParam(value: string | number | undefined): AgentToolDef[] {
  const raw = String(value ?? DEFAULT_AGENT_TOOLS.join(','))
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const picked = ids
    .map(agentToolById)
    .filter((t): t is AgentToolDef => !!t)
  return picked.length ? picked : AGENT_TOOLS.filter((t) => DEFAULT_AGENT_TOOLS.includes(t.id))
}
