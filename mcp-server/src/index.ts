#!/usr/bin/env node
// CasperFlow MCP server — exposes CasperFlow's real Casper Network actions as
// Model Context Protocol tools, so any MCP client (nanobot, Claude, Cursor,
// Claude Code…) can read balances, resolve CSPR.names, send CSPR, delegate, and
// anchor EIP-712 attestations on Casper.
//
// Config via environment variables:
//   CASPER_NETWORK        "testnet" (default) | "mainnet"
//   CASPER_SECRET_KEY_HEX hex secret key used to sign (required for writes)
//   CASPER_KEY_ALGO       "ed25519" (default) | "secp256k1"
//   CSPR_CLOUD_KEY        CSPR.cloud API key (required for reads + node RPC auth)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  loadConfig,
  getBalance,
  resolveCsprName,
  sendCspr,
  delegate,
  attest,
} from './casper.js'

const cfg = loadConfig()
const server = new McpServer({ name: 'casperflow', version: '0.1.0' })

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] })
const fail = (e: unknown) => ({
  content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
})

server.tool(
  'casper_account_info',
  'Return the agent wallet public key, network, and live balance.',
  {},
  async () => {
    try {
      if (!cfg.publicHex) return ok(`No signing key set. Network: ${cfg.net}. Reads only.`)
      const bal = await getBalance(cfg, cfg.publicHex)
      return ok(
        `Network: ${cfg.net}\nPublic key: ${cfg.publicHex}\nBalance: ${bal == null ? 'not funded' : bal + ' CSPR'}`,
      )
    } catch (e) {
      return fail(e)
    }
  },
)

server.tool(
  'casper_get_balance',
  'Get the live CSPR balance of any account by its public key.',
  { publicKey: z.string().describe('Casper public key (01… or 02…)') },
  async ({ publicKey }) => {
    try {
      const bal = await getBalance(cfg, publicKey)
      return ok(bal == null ? 'Account not found / not funded.' : `${bal} CSPR`)
    } catch (e) {
      return fail(e)
    }
  },
)

server.tool(
  'casper_resolve_name',
  'Resolve a CSPR.name (e.g. alice.cspr) to its on-chain account hash.',
  { name: z.string().describe('A CSPR.name such as "alice.cspr"') },
  async ({ name }) => {
    try {
      const hash = await resolveCsprName(cfg, name)
      return ok(`account-hash-${hash}`)
    } catch (e) {
      return fail(e)
    }
  },
)

server.tool(
  'casper_send_cspr',
  'Send CSPR to a recipient (public key, account hash, or a CSPR.name you resolved). Signs and submits a real transaction.',
  {
    recipient: z.string().describe('Public key (01…/02…) or 64-char account hash'),
    amount: z.number().positive().describe('Amount in CSPR (minimum 2.5)'),
    transferId: z.number().int().optional().describe('Optional numeric memo'),
  },
  async ({ recipient, amount, transferId }) => {
    try {
      if (amount < 2.5) return fail(new Error('Minimum native transfer is 2.5 CSPR.'))
      const r = await sendCspr(cfg, recipient, amount, transferId)
      return ok(`Sent ${amount} CSPR.\nTx: ${r.hash}\n${r.url}`)
    } catch (e) {
      return fail(e)
    }
  },
)

server.tool(
  'casper_delegate',
  'Delegate (stake) CSPR to a validator. Signs and submits a real transaction.',
  {
    validator: z.string().describe('Validator public key'),
    amount: z.number().positive().describe('Amount in CSPR'),
  },
  async ({ validator, amount }) => {
    try {
      const r = await delegate(cfg, validator, amount)
      return ok(`Delegated ${amount} CSPR to ${validator.slice(0, 10)}….\nTx: ${r.hash}\n${r.url}`)
    } catch (e) {
      return fail(e)
    }
  },
)

server.tool(
  'casper_attest',
  'Create an EIP-712 attestation (a verifiable proof of a statement/decision) and anchor it on Casper. Returns the claim hash and explorer link.',
  {
    topic: z.string().describe('Short topic label, e.g. "agent-decision"'),
    data: z.string().describe('The exact content to attest (the claim)'),
  },
  async ({ topic, data }) => {
    try {
      const r = await attest(cfg, topic, data)
      return ok(
        `Attestation anchored on Casper.\nClaim hash: ${r.claimHash}\nDigest: ${r.digest}\nTx: ${r.hash}\n${r.url}`,
      )
    } catch (e) {
      return fail(e)
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`CasperFlow MCP server running (network: ${cfg.net}, signer: ${cfg.publicHex || 'none'}).`)
