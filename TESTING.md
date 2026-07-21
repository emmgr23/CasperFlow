# Testing CasperFlow on Casper testnet

Step-by-step instructions to run and verify the MVP. Everything runs on **Casper
testnet**; no mainnet keys or real funds are needed.

## 1. Prerequisites

- Node 20+ and npm
- A Casper **testnet** account, funded from the faucet: https://testnet.cspr.live/tools/faucet
- An AI API key that supports tool calling (e.g. Groq `llama-3.3-70b-versatile`,
  OpenAI, Claude, or Gemini)

## 2. Run the app

```bash
git clone https://github.com/emmgr23/CasperFlow.git
cd CasperFlow
npm install
npm run dev
```

Open http://localhost:5173.

## 3. Configure (Settings)

1. **Settings → AI**: paste your AI API key and pick a tool-calling model.
2. **Settings → Integrations → Wallets**: generate or import an autonomous agent
   key, then fund it from the faucet and confirm the balance.
3. Enable **Live execution** (top bar / Settings). With it off, runs are simulated.
4. Optional — **Settings → Integrations → Telegram**: add a bot token + chat ID to
   receive notifications.

> Tip: keep a **second** saved wallet. Casper rejects self-transfers, so the
> recipient of a payment (and the attestation anchor) must differ from the signer.

## 4. Test A — Treasury Guardian (autonomous payment + on-chain proof)

1. On a blank canvas, open the template picker and choose **Autonomous treasury agent**
   (Wallet → Spend limit → AI Agent).
2. Select your funded wallet on the **Wallet** node.
3. Set the **Spend limit** to `10 CSPR / Day`.
4. On the **AI Agent** node, keep the role "Treasury operator" and set the goal
   (replace the recipient with a **real** second wallet key):

   ```
   Check my wallet balance. If it is above 4000 CSPR, send 5 CSPR to <RECIPIENT>
   and anchor a one-line note on Casper explaining what you did. Otherwise do
   nothing and tell me why.
   ```

5. Click **Run once** and watch the Log.

**Expected:** the agent reads the balance, sends 5 CSPR (real transaction), anchors
an EIP-712 attestation, and (if configured) sends one Telegram message. Each step
prints a `testnet.cspr.live` link. Open the transfer link and confirm **Status:
Success**.

## 5. Test B — Guardrail (safe refusal, nothing moves)

Repeat Test A but set the goal's recipient to the literal placeholder
`<Recipient>` (i.e. do not provide an address).

**Expected:** the agent refuses cleanly — "NO destination address was provided" —
the AI Agent node turns **red**, **no funds move**, and no false note is anchored.
This demonstrates the spend/consistency guardrails. Lower the balance threshold or
raise it above the balance to see the "do nothing and tell me why" path.

## 6. Test C — Agent marketplace (x402, agent pays agent)

Requires the demo server. Use two different wallets you control (seller = `PAY_TO`,
buyer = the agent wallet).

```bash
CSPR_CLOUD_KEY="<your-cspr-cloud-key>" PAY_TO="<SELLER-public-key>" \
  node x402-server/server.mjs
```

1. In the app, choose the **★ Agent Marketplace (x402)** template.
2. Set the buyer wallet on the **Wallet** node; enable Live execution.
3. Click **Run once**.

**Expected:** the seller lane publishes a signal; the buyer lane gets HTTP 402, pays
~2.5 CSPR on Casper, the server verifies the transfer on-chain, returns the signal,
and the agent anchors the trade. Confirm the payment transaction is **Success** on
`testnet.cspr.live`.

Full narration for each scenario is in [`DEMO_SCENARIOS.md`](DEMO_SCENARIOS.md) and
[`DEMO3_MARKETPLACE.md`](DEMO3_MARKETPLACE.md).

## 7. Verify on-chain

Every real action links to `https://testnet.cspr.live/transaction/<hash>`. A set of
sample transactions with descriptions is listed in
[`TESTNET_TRANSACTIONS.md`](TESTNET_TRANSACTIONS.md).

## Troubleshooting

- **Agent "talks" but does nothing** → your model/endpoint does not support tool
  calling. Switch to a tool-calling model.
- **Transfer refused** → recipient equals the signer (self-transfer), amount below
  the 2.5 CSPR native minimum, or over the spend limit. The log states which.
- **Runs are simulated** → enable Live execution.
