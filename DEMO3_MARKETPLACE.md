# Demo 3: The agent marketplace on Casper (x402, two agents)

The one-line story: **"One agent sells a signal, another agent pays for it on Casper,
and the trade proves itself on-chain."** This is the machine economy — agents paying
agents — running for real on Casper testnet, built with no code.

It's the natural climax after Demo 1 (the no-code builder) and the Treasury Guardian:
here money moves *between* autonomous agents, settled and verified on Casper.

---

## What the audience sees

A single canvas with two lanes:

- **Seller lane** (top): a schedule trigger → **Sell via x402**. The seller agent lists
  a CSPR market signal for sale at 2.5 CSPR per call.
- **Buyer lane** (bottom): **Wallet → Spend limit → x402 payment → AI → Attest → Telegram**.
  The buyer agent calls the listing, gets HTTP 402, pays the price on Casper with a real
  CSPR transfer, receives the signal, decides what to do, and anchors the trade on-chain.

Every number in the logs is a real, final Casper testnet transaction you can open on
cspr.live.

---

## One-time setup (before filming)

You need **two wallets you control**: a *seller* (receives the payment) and a *buyer*
(the autonomous agent that pays). Casper rejects self-transfers, so they must differ.

1. **Start the x402 server**, pointing `PAY_TO` at your **seller** wallet:

   ```bash
   cd CasperFlow
   CSPR_CLOUD_KEY="<your-free-cspr-cloud-key>" \
   PAY_TO="<SELLER-public-key-hex>" \
   node x402-server/server.mjs
   ```

   You should see `paid URL: http://localhost:4021/premium`.

2. **In CasperFlow**, open the **template picker** and choose **★ Agent Marketplace (x402)**.

3. On the **Wallet** node (buyer lane), select your **buyer** wallet (the autonomous
   agent key, funded on testnet, different from the seller). Enable **live execution**.

That's it — endpoints are pre-filled (`/publish` and `/premium` on `localhost:4021`).

---

## Run order (so the buyer buys the seller's signal)

The buyer lane forks from the seller's publish step, so in a single run the seller
publishes first, then the buyer pays. If you want a clean two-pass version for the
camera:

1. **Pass 1** — Run once. The seller publishes its signal; the buyer pays 2.5 CSPR on
   Casper, the server verifies the transfer on-chain, and the signal comes back.
2. **Pass 2** (optional) — Edit the seller's signal text and run again to show the buyer
   now receives the *new* listing. Proof the marketplace is live, not canned.

---

## The 90-second script

1. **Open on the canvas.** "Two agents. The top one sells a market signal. The bottom one
   buys it — and pays on Casper." (~8s)
2. **Run once.** Point at the seller log: `✓ Listed on x402 at 2.5 CSPR/call`. (~10s)
3. **Buyer lane lights up:** `x402: HTTP 402 → paying 2.5 CSPR to <seller>… on Casper` →
   `paid — settlement tx <hash>… — server is verifying on-chain` →
   `✓ x402 paid 2.5 CSPR → resource delivered and verified`. (~25s)
4. **The buyer's AI decides** on the bought signal (one sentence in the log). (~10s)
5. **Attest:** the trade is anchored on Casper as an EIP-712 attestation. (~10s)
6. **Telegram** arrives: "paid 2.5 CSPR for a signal, decided and anchored on Casper" with
   the proof link. (~7s)
7. **Open cspr.live:** show the payment transfer **Success** and the attestation. Close on
   the canvas. (~20s)

---

## Subtitle lines to reuse

- "Two agents on one canvas."
- "The seller lists a signal for sale via x402."
- "The buyer gets a 402 — payment required."
- "It pays 2.5 CSPR on Casper, by itself."
- "The server verifies the transfer on-chain before delivering."
- "The buyer acts on the signal — and anchors the trade on Casper."
- "Agents paying agents. Settled and proven on Casper."

---

## Why this demo wins

- It shows the **machine economy** — agents transacting with agents — which is exactly
  where x402 and autonomous agents are heading, and Casper just joined the x402 Foundation.
- It is **real end-to-end**: a true HTTP 402 handshake, a real CSPR transfer, on-chain
  verification by the server, and an on-chain attestation of the trade. Nothing simulated.
- It is **no-code**: a marketplace between two paying agents, built by picking one template
  and one wallet.
- It pairs with the spend-limit guardrail (the buyer never pays above its cap) and the
  response check (a junk signal is rejected before it's trusted), so it's the *safe*
  version of autonomous spending.

## Honest notes

- The on-chain settlement uses the real `payX402OnChain` path (402 → real transfer → present
  hash → server verifies via CSPR.cloud → resource). Keep it on **testnet**.
- The server's `verifyOnChain` polls CSPR.cloud for the transfer to `PAY_TO`; give it a few
  seconds after payment — the log prints `…verifying` until the transfer is indexed.
- The seller's signal here is a fixed string for a predictable demo; swap in an **AI** node
  on the seller lane if you want the signal itself to be model-generated.
