# CasperFlow — Demo scenarios (film tomorrow)

Short demos. Each is self-contained (~45–90s). None need extra setup.

Global prep (once, before filming):
- Settings → Integrations → Casper: **testnet**, paste the CSPR.cloud key.
- Connect a funded **testnet** wallet (Autonomous) + a second saved wallet (for
  attestation anchors / a distinct payment recipient).
- Turn **ON** "Execute real transactions". Keep Settings → Logs open in a tab.
- Have `testnet.cspr.live` open to show the settled transactions.

> Reminder for the voiceover: say **testnet** at least once per demo. Never show
> a mainnet key.

---

## Demo 1 — x402 marketplace: one agent sells, another pays (PRIORITY)

**Story:** the machine economy — an agent monetises a signal, another agent pays
for it per call on Casper, settled on-chain.

Setup:
- Terminal: `cd x402-server && node server.mjs` (env: NETWORK=testnet,
  CSPR_CLOUD_KEY, PAY_TO = your seller wallet, PRICE_MOTES=2500000000).
- Buyer agent: template **★ Capped Treasury (Spend limit)** OR a 3-node flow:
  `Wallet → x402 (endpoint http://localhost:4021/premium) → Notify`.

Steps to film:
1. Show the server terminal (it's listening).
2. Run once. Narrate the log line by line as it appears:
   - `x402: requesting …/premium` → `402: paying 2.5 CSPR …`
   - `paid — settlement tx …` → server verifies on-chain →
   - `✓ x402 paid 2.5 CSPR → resource delivered (HTTP 200)`.
3. Click the `View:` link → show the **Success** transfer on cspr.live.
4. One sentence: "Real value, settled on Casper, between two autonomous agents."

Fallback if the server isn't running: the node logs a clear "is the server
running?" — just start it and re-run.

---

## Demo 2 — Spend limit: the agent that can't overspend (NEW)

**Story:** autonomous payments are scary unless they're bounded. CasperFlow caps
spend on-chain-spend per day.

Flow: `Wallet → Spend limit (max 5 CSPR / Day) → x402 (max 3) → Notify`, or just
add a **Spend limit** node in front of any paying action.

Steps to film:
1. Set Spend limit = **5 CSPR / Day**. Run once → first payment goes through
   (`✓ x402 paid 2.5 CSPR`).
2. Run again → second payment goes through (total 5.0).
3. Run a third time → log shows
   `🛡️ Spend limit reached — x402 payment of 2.5 CSPR blocked (cap 5 CSPR / day, already spent 5.00)`.
4. One sentence: "The agent physically cannot spend past the budget you set —
   the guardrail every autonomous payment system is missing."

---

## Demo 3 — Verifiable receipt + response check (NEW)

**Story:** paid ≠ delivered. CasperFlow verifies the seller's response before
trusting it, and prints a permanent, explorer-verifiable receipt.

Flow: `Wallet → x402 (Advanced: "Require response contains" = a word you know is
in the good response; OR Min length = 8) → Verifiable receipt → Notify`.

Steps to film — two takes:
1. **Happy path:** good response → `✓ x402 paid … and verified` → the
   **Verifiable receipt** node prints the receipt block (resource, amount, payTo,
   settlement tx, Verify link). Click the link → cspr.live Success.
2. **Bad path:** set "Require response contains" to a word that ISN'T returned →
   `🔎 x402 response FAILED verification … paid … but NOT trusting the result.
   Branch stops.` Notify never fires. One sentence: "Paid, but the junk response
   is rejected and nothing downstream consumes it — escrow/refund is the next
   step."

---

## Optional — Treasury Guardian (existing flagship)
If you want a sixth: the showcase Smart Treasury template (AI gate → attest on
Casper → notify) you already validated. Good B-roll, not required.

## Capture tips
- 1280×800, hide the OS dock, zoom the canvas so the running node + its electric
  sparks are clearly visible.
- Let each log line breathe — the logs ARE the proof.
- End every demo on a cspr.live **Success** page.
