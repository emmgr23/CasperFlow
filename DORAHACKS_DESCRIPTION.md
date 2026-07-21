CasperFlow, build autonomous AI agents on Casper, no code
Describe what you want in plain English. Get an agent that reads on-chain data, decides with AI, and signs real Casper transactions on its own.
[🎬 Demo video](https://youtu.be/hexnF7Gd9lw) · [💻 GitHub](https://github.com/emmgr23/CasperFlow) · [📦 MCP server (npm)](https://www.npmjs.com/package/casperflow-mcp)
CasperFlow is a no-code visual builder for autonomous AI agents on Casper. You drag blocks onto a canvas and connect them, or just describe what you want in one sentence and an AI assembles the flow for you. The result is an agent that reads live on-chain data, decides with an LLM, and signs real Casper transactions by itself. No Rust, no terminal. And every on-chain action is also published as an MCP server, so other AI tools can call the same Casper actions.
The problem
Building an autonomous agent on Casper today means writing Rust, deploying contracts, and living in a terminal. That leaves out the people who actually have the ideas, treasurers, operators, founders, analysts. CasperFlow removes that barrier: if you can describe the job, you can ship the agent.
Flagship: the Treasury Guardian (live on testnet, end-to-end)
Build it by hand, or type one sentence and let the AI assemble it. Then it runs on a schedule, autonomously:

1. It reads its wallet's real CSPR balance on-chain (via CSPR.cloud).
2. An AI decides whether it's safe to release a payroll payment.
3. If approved, the agent signs and sends real CSPR transfers by itself, no popup.
4. A second AI writes a short, plain-language audit summary of the decision.
5. Both AI verdicts are anchored on Casper as a tamper-proof EIP-712 attestation.
6. A full Telegram report is delivered with every transaction proof link.

Every step is a real, final transaction you can open on the public Casper explorer. When the treasury drops below the safe threshold, the guardrail refuses to pay and stops the agent on its own. Nothing is faked.

What's real today (not a mockup)
| Capability | What's real |
| --- | --- |
| Autonomous signed transactions | Send CSPR, stake/delegate, call contracts, anchor attestations, signed locally, no popup, on testnet |
| x402 pay-per-call | `402 → pay on Casper → server verifies on-chain → data returned`; tested end-to-end |
| x402 earn | A Sell via x402 block lets an agent sell its own output (a signal, score, or feed) for other agents to buy per call |
| Spending guardrails | A Spend limit caps CSPR moved (per run / per day / total) and blocks anything over budget; x402 answers are verified before they're trusted; a Verifiable receipt logs every payment |
| Verifiable AI | EIP-712 attestation of AI decisions anchored on Casper, a short commitment, or the full 256-bit digest across four transfers |
| Bring your own AI | Claude, GPT, Gemini, Grok, or any OpenAI-compatible endpoint |
| On-chain reads | Live CSPR price, balances, and incoming transfers, used as triggers and conditions |
| Alerts | Telegram and Discord messages carrying the on-chain proof link |
| MCP server | Published on npm as `casperflow-mcp`, exposes Casper actions to any AI agent |

On-chain proof (real testnet transactions)
Every action above is a real, final transaction on Casper testnet, signed locally by the agent — not a mockup. Here are transactions produced by the autonomous agent that you can open right now:
| Transaction | What it proves | Explorer link |
| --- | --- | --- |
| Autonomous transfer | The agent read its on-chain balance, decided the treasury was above threshold, and **sent 5 CSPR by itself** (signed locally, no popup). Status: Success. | [d93df443…db642b](https://testnet.cspr.live/transaction/d93df443e283fb236eef214f26e90fbc40d2762e32cf7dc80eebbb2574db642b) |
| EIP-712 attestation | The agent **anchored its AI decision on Casper** as a tamper-proof attestation (the "verifiable AI" proof paired with the payment above). | [c72b7ce4…5bd021a](https://testnet.cspr.live/transaction/c72b7ce4419e3932793e5712027a8afc5b91f126a5d24018a4779509f5bd021a) |
| EIP-712 attestation | An earlier autonomous run anchoring a decision on Casper. Status: Success. | [00da4ad6…3519a1bd](https://testnet.cspr.live/transaction/00da4ad61ae02f1b587e19da029203f05fe3f965e7d51c6d2fb4d13f3519a1bd) |

Agent account (all of its on-chain activity): [0203510844…304dc1475](https://testnet.cspr.live/account/0203510844f1cdf751c2ccb6950be6e57477d9dd9ee3cb4c1deb6676d1f304dc1475)

CasperFlow is a client/agent layer: it drives Casper via native transactions, EIP-712 typed-data attestations (`@casper-ecosystem/casper-eip-712`), calls to existing contracts (the Call contract node), and x402 micropayments verified on-chain through CSPR.cloud.

It's a platform, not one fixed use case
The same canvas builds a treasury guardian, a payroll agent, a DeFi monitor, an RWA oracle, or a simple alert bot, from one library of blocks: triggers, logic, trading & DeFi, payments, smart contracts, real-world assets, and outputs.
The MCP server opens Casper both ways: non-developers build agents visually, while developers wire the same Casper actions into their own agents over MCP. And because any agent decision can be anchored on Casper, the AI's reasoning becomes an auditable record, a natural fit for treasury, payroll, and compliance work.
x402, how agents pay each other (what we're most excited about)
Pay is live and tested end-to-end. Earn is live too, an agent can sell its output to other agents. Coming next is conditional payment (escrow): funds sit in escrow on Casper and are only released once delivery is verified, otherwise refunded, so an agent never pays for work that didn't happen. The in-app half (pay, verify, and stop if the answer is wrong) already ships; the on-chain Odra escrow contract is the next piece, followed by a pay-per-call MCP server and a live two-agent marketplace demo settling on-chain.
Roadmap, next 10 days

* x402 conditional escrow (Odra): pay → verify → release or refund
* Full x402 loop: pay (done), earn (done), and a pay-per-call MCP server
* A live x402 marketplace demo between two agents
* CSPR.trade swaps from beta to live, so agents can trade on their own
* A hosted runner so agents keep running without the browser open
* On-chain attestation registry (Odra) so proofs are easy to query
* A one-click template library

Why Casper
Low, predictable fees and fast finality make it practical to run scheduled, autonomous agents that act often. The account model, weighted keys and action thresholds, is a strong fit for permissioned agents and for escrow or multisig setups. And on-chain attestation turns the AI's reasoning into a record a company can actually rely on.
Tech stack
React 18 · TypeScript · Vite · React Flow (canvas) · casper-js-sdk v5 (real TransactionV1 signing & submission) · CSPR.cloud (on-chain reads) · casper-eip-712 (attestations & x402) · a zero-dependency Node server for the x402 demo.
How to test it yourself (Casper testnet)
Everything runs on Casper testnet; no mainnet keys or real funds are needed.

1. `git clone https://github.com/emmgr23/CasperFlow && cd CasperFlow`
2. `npm install && npm run dev` → open http://localhost:5173
3. Settings → AI: add an API key that supports tool calling (Groq `llama-3.3-70b`, OpenAI, Claude, or Gemini).
4. Settings → Wallets: generate an agent key, fund it at the [testnet faucet](https://testnet.cspr.live/tools/faucet), and enable Live execution.
5. Choose the **Autonomous treasury agent** template, select your wallet, set a Spend limit, and give it a goal in plain English (e.g. "Check my balance; if above 4000 CSPR send 5 CSPR to <a second wallet> and anchor a note on Casper; otherwise do nothing and say why").
6. Run once → the agent reads its balance, sends CSPR, anchors an EIP-712 attestation, and notifies — each step prints a `testnet.cspr.live` link you can open.

Full step-by-step guide: [TESTING.md](https://github.com/emmgr23/CasperFlow/blob/main/TESTING.md) · more sample transactions: [TESTNET_TRANSACTIONS.md](https://github.com/emmgr23/CasperFlow/blob/main/TESTNET_TRANSACTIONS.md)
