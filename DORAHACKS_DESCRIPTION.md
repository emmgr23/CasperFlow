CasperFlow
A no-code visual builder for autonomous AI agents on Casper. You drag blocks onto a canvas, connect them, and get an agent that reads live on-chain data, decides with an AI model, and signs real Casper transactions on its own. No code, no terminal. You can also deploy real smart contracts (tokens, NFT collections) just by choosing what they do from dropdowns. And everything an agent can do on-chain is also published as an MCP server, so other AI tools can call the same Casper actions.

THE PROBLEM WE WANTED TO FIX
Building an autonomous agent on Casper today means writing Rust, deploying contracts and living in a terminal. That leaves out most of the people who actually have the ideas: treasurers, operators, founders, analysts. We wanted to take that barrier away.

WHAT IT DOES
You build an agent by hand on the canvas, or just describe what you want in plain English and an AI assembles the flow for you. Our flagship, the Treasury Guardian, runs end to end on Casper testnet:
1. It reads its wallet's real CSPR balance on-chain (via CSPR.cloud).
2. An AI decides whether it's safe to release a payroll payment.
3. If approved, the agent signs and sends a real CSPR transfer by itself, no popup.
4. A second AI writes a short, plain-language summary of the decision.
5. Both AI verdicts are anchored on Casper as a tamper-proof EIP-712 attestation.
Every step is a real, final transaction you can open on the public Casper explorer. Nothing is faked. From the same canvas you can also launch a CEP-18 token or a CEP-78 NFT collection and pick exactly how the contract behaves, without touching Rust.

WHAT WORKS TODAY (real, not a mockup)
• Autonomous signed transactions, signed locally with no popup: send CSPR, stake and delegate, call contracts, anchor attestations. On testnet.
• x402 pay-per-call: an agent calls a paid API, pays on Casper, the server checks the payment on-chain, and the data comes back. Tested end to end.
• x402 earn: a Sell via x402 block lets an agent sell its own output (a signal, a score, a data feed) for other agents to buy per call.
• Guardrails for autonomous spending: a Spend limit caps how much CSPR an agent can move (per run, per day, or in total) and blocks anything over budget. x402 answers are checked before they are trusted, so junk is rejected. A Verifiable receipt block makes a permanent record of each payment, checkable on the explorer.
• AI decisions through your own provider (Claude, GPT, Gemini, Grok, any OpenAI-compatible endpoint).
• On-chain reads: live CSPR price, balances and incoming transfers, used as triggers and conditions.
• Alerts: Telegram and Discord messages with the on-chain proof link.
• EIP-712 attestation of AI decisions (a short commitment, or the full 256-bit digest across four transfers).
• MCP server, published on npm as casperflow-mcp, exposing Casper actions to any AI agent.
• No-code contract deployment (beta): deploy a real CEP-18 token (fixed or mintable/burnable, with or without on-chain events) or a CEP-78 NFT collection, choosing ownership, who can mint, mutable metadata and burnability from dropdowns, then mint NFTs, no Rust. The code is done and we are validating it on testnet now.

A FEW THINGS WORTH POINTING OUT
It's a platform, not one fixed use case. The same canvas builds a treasury guardian, a payroll agent, a DeFi monitor, an RWA oracle or a simple alert bot, from one library of blocks: triggers, logic, trading and DeFi, payments, smart contracts, real-world assets and outputs.
The MCP server opens Casper both ways: non-developers build agents visually, while developers wire the same Casper actions into their own agents over MCP.
Verifiable AI: any agent decision can be anchored on Casper, which turns the AI's reasoning into a record you can audit later. That fits treasury, payroll and compliance work well.
Configurable contracts, not just templates: a standard like CEP-78 is built to be configured when you install it, so the dropdown choices map onto how the contract behaves. You get a real, custom token or NFT collection from one audited WASM, with no compiler.

WHERE WE'RE TAKING x402 NEXT
x402 is the part we're most excited about, because it's how agents pay each other. Pay is live and tested end to end. Earn is live too, an agent can sell its output to other agents. Conditional payments (escrow) come next: the money sits in escrow on Casper and is only released once delivery is verified, otherwise it's refunded, so an agent never pays for work that didn't happen. The in-app part (pay, verify, and stop if the answer is wrong) already ships, and the on-chain escrow contract written in Odra is the next piece. After that, a pay-per-call MCP server so outside agents pay small amounts to use Casper actions, and a live marketplace demo where one agent sells a signal and another buys it per call, settling on-chain.

ROADMAP, NEXT 10 DAYS
• No-code contracts live on testnet: deploy and mint CEP-18 tokens and CEP-78 NFT collections for real.
• x402 conditional escrow with the Odra contract: pay, verify, then release or refund.
• Full x402 loop: pay (done), earn (done), and a pay-per-call MCP server.
• A live x402 marketplace demo between two agents.
• CSPR.trade swaps from beta to live, so agents can trade on their own.
• A hosted runner so agents keep running without leaving the browser open.
• On-chain attestation registry (Odra) so proofs are easy to query.
• A template library so anyone can ship a working agent in one click.

WHY CASPER
Low, predictable fees and fast finality make it practical to run scheduled, autonomous agents that act often. The account model, with weighted keys and action thresholds, is a good fit for permissioned agents and for escrow or multisig setups. And on-chain attestation turns the AI's reasoning into a record a company can actually rely on.

TECH STACK
React 18, TypeScript and Vite, React Flow for the canvas, casper-js-sdk v5 for real TransactionV1 signing and submission, CSPR.cloud for on-chain reads, casper-eip-712 for attestations and x402, and the standard CEP-18 and CEP-78 contracts configured through their install arguments, plus an Odra escrow contract for x402 conditional payments.

LINKS
Demo video: https://www.youtube.com/watch?v=qeYvUQhODN0
GitHub: https://github.com/emmgr23/CasperFlow
MCP server (npm): https://www.npmjs.com/package/casperflow-mcp
