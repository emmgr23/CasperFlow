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
