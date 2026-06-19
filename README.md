# CasperFlow

**The no-code visual builder for autonomous AI agents on the Casper Network.**

Drag blocks onto a canvas, connect them, and get an agent that reads live on-chain
data, reasons with an LLM, and signs **real Casper transactions** — autonomously, on a
schedule, with no code and no terminal. Every AI decision can be cryptographically
anchored on-chain as a tamper-proof EIP-712 attestation.

Built for the **Casper Agentic Buildathon 2026**.

---

## What's actually real (runs today on testnet)

- **Real signed Casper transactions**, fully autonomous (local signing, no wallet popup):
  send CSPR, stake / delegate, call contracts, and anchor EIP-712 attestations.
- **Real AI decisions** via your own provider (Claude, GPT, Gemini, Grok, or any
  OpenAI-compatible endpoint) that read live run context and either *gate* or *summarize* actions.
- **Real on-chain reads**: live CSPR price, account balances, incoming transfers — used as
  triggers and conditions.
- **Real outputs**: Telegram and Discord notifications with on-chain proof links.
- **Wallets**: multiple saved profiles, per-action signing, autonomous or ask-approval modes.
- **x402 (beta)**: agents can pay paid HTTP APIs per request via Casper x402 (EIP-712
  TransferAuthorization) — the machine-to-machine agent economy.
- **MCP server** ([`casperflow-mcp`](https://www.npmjs.com/package/casperflow-mcp)): a standalone
  Model Context Protocol server that exposes these same Casper actions to any AI agent
  (nanobot, Claude, Cursor) — making CasperFlow the **action layer** for the whole agent ecosystem.

## Why Casper

Predictable, low fixed fees and fast deterministic finality make scheduled, autonomous,
high-frequency agent actions practical. The advanced account model (weighted keys, action
thresholds) fits permissioned autonomous agents, and on-chain attestation turns AI
reasoning into a verifiable, auditable record — the killer pattern for treasury, payroll
and compliance use cases.

## Tech stack

React 18 + TypeScript + Vite · React Flow (`@xyflow/react`) for the canvas ·
`casper-js-sdk` v5 for real TransactionV1 signing/submission · CSPR.cloud REST for on-chain
reads · `@casper-ecosystem/casper-eip-712` for attestations & x402.

## Run locally

```bash
npm install
npm run dev
```

Then open the app, add your own AI key and a **testnet** wallet in Settings → Integrations,
turn on "Execute real transactions", and build an agent — or just describe one in plain
English in the command bar.

> ⚠️ **Testnet only.** Wallet keys you add are stored unencrypted in your browser's
> localStorage and are used to sign locally. Never paste a mainnet key holding real funds.

## License

Source-available under the **PolyForm Noncommercial License 1.0.0** — free to use, study,
modify and share for **non-commercial** purposes. See [LICENSE](./LICENSE).
