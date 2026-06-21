CasperFlow — Demo video #1 script (AI builds it, live on Casper)

Total: ~2 to 2.5 minutes. Two scenes. Everything is real on Casper testnet.

================================================================
PREP (before you hit record)
================================================================
- x402 server running in a terminal (keep it visible on screen):
    cd ~/Desktop/Code/CasperFlow/x402-server
    CSPR_CLOUD_KEY=019ed5ac-534b-7c9d-a058-f11dcb08c280 PAY_TO=02023e2280cc9298ee0d8a3555d8561377bb5eb931622e97aa0991e87e9b4fc9ecb9 NETWORK=testnet node server.mjs
- Settings -> Integrations -> Casper: testnet, CSPR.cloud key set, "Execute real transactions" ON.
- Telegram alerts configured (token + chat id). Have the Telegram chat open in a window you can switch to.
- Wallet 5 funded (it signs both scenes).
- RELOAD the page right before recording — this resets the per-session spend counter to 0 so the 10 CSPR/day cap never blocks a take.
- Start on a blank canvas. The AI bar EDITS the current agent, so open a NEW workspace before each scene to build fresh.

The two phrases to paste into the AI bar:
  SCENE 1:
    Using wallet 5, send 3 CSPR to 02023e2280cc9298ee0d8a3555d8561377bb5eb931622e97aa0991e87e9b4fc9ecb9 and text me the transaction hash on Telegram.
  SCENE 2:
    With wallet 5, buy a trading signal from http://localhost:4021/premium using x402, cap spending at 10 CSPR per day, save a verifiable receipt, and text me the proof link on Telegram.

================================================================
SCENE 1 — "Send money on Casper, just by asking" (~50 s)
================================================================

0:00–0:08  On a blank canvas.
  SAY: "This is CasperFlow. I don't write code — I just describe what I want."

0:08–0:18  Paste SCENE 1 phrase into the AI bar, hit the sparkle / Enter.
  SAY: "I ask it to send 3 CSPR to an address and text me the transaction hash."
  ON SCREEN: the AI builds the flow automatically — Wallet (wallet 5, bound on its own) -> Send CSPR -> Notification.

0:18–0:24  Point at the cards.
  SAY: "It built the agent and bound my wallet by itself. No clicking."

0:24–0:45  Click Run once. Narrate the log as it streams:
  - "Send CSPR submitted — <hash>"
  - "Confirming Send CSPR on-chain…"
  - "✓ Send CSPR CONFIRMED — Success"   <-- real finality, let it land
  SAY: "It signs and submits a real transaction, then confirms it actually succeeded on-chain."

0:45–0:50  Switch to the Telegram window.
  ON SCREEN: the message arrives with the real transaction hash + cspr.live link.
  SAY: "And here's the proof in my Telegram — the real hash, live on Casper."

(Optional 3 s: click the cspr.live link to show the Success page.)

================================================================
SCENE 2 — "An agent that pays for a service, on its own" (~60 s)
================================================================

0:50–0:58  Open a NEW workspace (blank canvas). Show the x402 server terminal once.
  SAY: "Now something agents can't do on a normal app: pay for a service by themselves."

0:58–1:10  Paste SCENE 2 phrase into the AI bar, run it.
  SAY: "I ask for an agent that buys a paid trading signal with x402, with a spending limit, a receipt, and a Telegram alert."
  ON SCREEN: the AI builds Wallet (wallet 5) -> Spend limit -> x402 -> Verifiable receipt -> Notification.

1:10–1:16  Point at the Spend limit card.
  SAY: "It even added a guardrail — it can never spend more than my daily budget."

1:16–1:45  Run once. Narrate the log:
  - "🛡️ Spend limit armed: ≤ 10 CSPR per day"
  - "x402: 402 → paying 2.5 CSPR on Casper"
  - "paid — server is verifying on-chain"
  - "✓ x402 paid 2.5 CSPR → resource delivered (HTTP 200)"
  - the premium signal JSON (BUY, confidence 0.82)
  - the Verifiable receipt block (amount, paid-to, settled hash, verify link)
  SAY (while it runs): "It hits a paid API, gets a 402, pays 2.5 CSPR on Casper, the server verifies the payment on-chain, and only then hands over the signal. With a verifiable receipt."

1:45–1:55  Switch to Telegram (proof link), then optionally the cspr.live Success page.
  SAY: "Real value, settled on Casper, between autonomous agents — with proof."

================================================================
CLOSE (~10 s)
================================================================
  SAY: "No code. Real transactions. Verifiable. That's CasperFlow — the action layer for agents on Casper."
  (Show the GitHub + npm links on a final card or in the description.)

================================================================
CAPTURE TIPS
================================================================
- 1280x800, hide the OS dock, zoom the canvas so the running node + its electric sparks are visible.
- Let each "Confirming… → ✓ CONFIRMED / ✓ verified" line breathe — the logs ARE the proof.
- Keep the x402 server terminal in frame during Scene 2 (its lines show the on-chain verification).
- End each scene on a Telegram message or a cspr.live Success page.
- If you do several takes, reload the page between them to reset the daily spend counter.
