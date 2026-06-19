# CasperFlow — Demo #1 Script & Shotlist
### "Treasury Guardian: an autonomous on-chain AI agent, built with no code"

**Target length:** 90 seconds (hard cap 2:00)
**Format:** screen recording (1080p min, ideally 1440p), cursor visible, no webcam needed
**Audio:** voice-over OR on-screen subtitles (pick one — see note at the end)
**Recommended narration language:** English (international jury). French version provided below.
**Tools to record:** QuickTime (Mac, free) or OBS / Loom. Record the browser tab only, hide bookmarks bar.

> The whole point of this demo: prove it's **real**, not simulated. The money line is showing the
> actual transaction on `testnet.cspr.live` at the end. Everything builds to that reveal.

---

## The 90-second beat sheet

| # | Time | On screen (SHOT) | What you DO | Narration (EN) |
|---|------|------------------|-------------|----------------|
| 1 | 0:00–0:08 | CasperFlow canvas, empty or with the app logo/title visible | Hold still on the clean canvas | "This is CasperFlow. It lets anyone build an autonomous AI agent that runs **on the Casper blockchain** — without writing a single line of code." |
| 2 | 0:08–0:25 | The node palette + canvas | Drag in the nodes one by one: **Wallet → Read balance → AI decision → Send CSPR → AI summary → Attest on Casper**. Connect them with edges. | "I'm building a Treasury Guardian. It checks our balance, lets an AI decide whether to release a payment, sends it, and then anchors its decision on-chain. I just drag, drop, and connect." |
| 3 | 0:25–0:33 | Click the **AI decision** node, show its config (the rule / instruction field) | Open the AI node, show the rule, close it | "The first AI is the guardian. Its rule: only release the payment if the treasury stays safely funded." |
| 4 | 0:33–0:40 | Click **Run once** (or the Go-live popup → Run once) | Press Run | "Let's run it — for real, on Casper testnet." |
| 5 | 0:40–0:52 | The **console / log panel** open, lines streaming: balance read → AI verdict → transfer submitted | Let the log stream; don't touch | "It reads the real balance from chain… the AI decides **yes**, release… and it signs and submits a real CSPR transfer." |
| 6 | 0:52–1:04 | Log continues: 2nd AI summary, then the attestation lines (the "FULL EIP-712 digest anchored across 4 transfers" message) | Point cursor at the attestation log line | "A second AI writes the summary — and here's the key part: **both AI verdicts get anchored on Casper** as a tamper-proof EIP-712 attestation. The agent's reasoning is now verifiable on-chain." |
| 7 | 1:04–1:20 | Switch tab to **testnet.cspr.live**, paste the tx/account, show the real transfers + transfer-ids | Open the explorer, show the confirmed transaction(s) | "And it's all real. Here's the transaction on the Casper testnet explorer — the payment, and the on-chain attestation carrying the AI's verdict. Live, finalized, verifiable." |
| 8 | 1:20–1:30 | Back to CasperFlow canvas, full agent visible | Hold on the finished agent | "CasperFlow — autonomous, verifiable AI agents on Casper. Built in two minutes, by anyone." |

---

## Narration — French version (si tu préfères filmer en français)

1. « Voici CasperFlow. Il permet à n'importe qui de créer un agent IA autonome qui s'exécute **sur la blockchain Casper** — sans écrire une seule ligne de code. »
2. « Je construis un agent gardien de trésorerie. Il vérifie le solde, laisse une IA décider de libérer un paiement, l'envoie, puis ancre sa décision on-chain. Je glisse, je dépose, je connecte. »
3. « La première IA est le gardien. Sa règle : ne libérer le paiement que si la trésorerie reste suffisamment financée. »
4. « Lançons-le — pour de vrai, sur le testnet Casper. »
5. « Il lit le vrai solde on-chain… l'IA décide **oui**, on libère… et il signe et soumet un vrai transfert CSPR. »
6. « Une deuxième IA rédige le résumé — et voici l'essentiel : **les deux verdicts de l'IA sont ancrés sur Casper** comme attestation EIP-712 infalsifiable. Le raisonnement de l'agent est maintenant vérifiable on-chain. »
7. « Et tout est réel. Voici la transaction sur l'explorateur testnet de Casper — le paiement, et l'attestation on-chain qui porte le verdict de l'IA. En direct, finalisée, vérifiable. »
8. « CasperFlow — des agents IA autonomes et vérifiables sur Casper. Construit en deux minutes, par n'importe qui. »

---

## Shot-by-shot recording plan (the practical version)

**Record in 3 takes, then stitch — much easier than one perfect run:**

- **Take A (build):** beats 1–3. Drag the nodes, connect, open the AI rule. If you fumble, just re-drag — you'll trim it.
- **Take B (run):** beats 4–6. Hit Run once, let the log stream to completion. **Do NOT touch anything while it runs.** Record until the attestation line appears.
- **Take C (proof):** beats 7–8. The explorer tab + final hold on the canvas.

Then cut to ~90s. Cut dead air aggressively — the build (Take A) can be sped up 1.5–2× with the narration over it.

**Visual polish:**
- Increase Interface size a touch if text looks small on export.
- Open the **console/log panel** before Take B so it's already visible.
- Keep the cursor moving deliberately — pause on the important log lines so the viewer reads them.
- End frame = the finished agent on a clean canvas (good thumbnail).

---

## Pre-flight checklist (do this BEFORE Take B, or the run fails on camera)

These are the things that make a live run actually succeed:

1. **A testnet wallet is connected AND funded.** Check it has test CSPR (faucet: testnet.cspr.live). The transfer needs ≥ 2.5 CSPR + ~0.1 fee, plus 4× small self-transfers for the attestation. Keep a comfortable buffer (e.g. 50+ CSPR).
2. **CSPR.cloud API key is set** (Integrations → Casper Network) so the balance read returns real data.
3. **AI model connected** (Integrations → AI Model → Test AI shows green "Connected"). Claude works in-browser — safest choice for the demo.
4. **Live execution is ON** (Integrations → Casper Network → "Execute real transactions").
5. **The AI rule actually returns YES** for the current balance — do ONE rehearsal run so you know it pays (not refuses) on camera. If it refuses, lower the threshold in the AI rule.
6. **Recipient is valid** (one of your own wallets is fine — payroll to a test address).
7. Have the **explorer tab pre-loaded** to your agent's account page so beat 7 is instant.

> Do a full silent rehearsal run first. When the log shows the transfer confirmed + "FULL EIP-712
> digest anchored across 4 transfers", you're green to record Take B for real.

---

## One decision to make: voice-over vs subtitles

- **Voice-over** = warmer, higher-rated by judges, but you need a quiet room + one clean recording of the lines above.
- **Subtitles** = zero audio risk, fully controllable, works if your English accent worries you. Add the narration lines as on-screen captions synced to each beat.

If unsure, do **subtitles for Demo #1** (ship today, zero risk) and add voice-over on a later update. The script works identically for both.

---

## After you upload

DoraHacks lets you keep editing the BUIDL until the deadline (July 1). So: ship this video + a short written description today, then push the next demos (CSPR.trade swap, x402, MCP server) as updates over the next 11 days. Done beats perfect.
