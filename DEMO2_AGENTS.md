# Demo 2: Teams of autonomous agents on Casper

Demo 1 (the current submission video) shows the no-code builder: build an agent by
hand or from one sentence, run real transactions, x402, and the Treasury Guardian.

Demo 2 shows the new pillar: **teams of autonomous agents that collaborate, govern
each other, and prove on-chain what they did.** This is the part no other project in
the hackathon has, because it combines no-code, multi-agent, and on-chain attestation.

The whole story in one line: *"You don't build a workflow. You hire a team of agents,
give them roles and tools, and Casper keeps them honest."*

---

## The three things Demo 2 must land

1. **Autonomy.** One Autonomous Agent node: you give it a goal in plain English, it
   picks the Casper tools itself and executes, under guardrails.
2. **Collaboration + governance.** Several agents with different roles, each with a
   limited toolset, communicating through the canvas. Separation of duties: one
   proposes, one checks, one executes.
3. **Proof.** Every agent decision and action is anchored on Casper as an EIP-712
   attestation. The reasoning becomes a record you can open on the explorer.

---

## Scene 1: One autonomous agent (the "ask it anything" wow), about 60 s

Drop a single **Autonomous Agent** node. Give it the role "Treasury operator" and the
tools: read balance, send CSPR, attest. Then type a goal:

```
Check wallet1's balance. If it is above 4700 CSPR, send 5 CSPR to wallet 3 and anchor
a one-line note on Casper explaining what you did. Otherwise do nothing and tell me why.
```

On screen: the agent reasons step by step in the live console, reads the balance,
decides, signs the transfer itself (no popup, under the spend limit), and anchors the
attestation. You open the transaction and the attestation on cspr.live. One node, a
plain sentence, real on-chain result.

## Scene 2: Two agents that hand off to each other, about 60 s

Add a second **Autonomous Agent** node and wire Agent 1 to Agent 2.

- **Agent 1, "Analyst"**: tools = read balance, read price. Role: decide whether the
  treasury can afford a payout and recommend an amount. It cannot sign anything.
- **Agent 2, "Executor"**: tools = send CSPR, attest. Role: execute the Analyst's
  recommendation, but never above the spend limit.

Goal typed into Agent 1:

```
Look at the treasury and the CSPR price, then recommend a safe payout for today's
contributors and explain your reasoning in one sentence.
```

On screen: Agent 1 produces a recommendation (a number plus a reason). That recommendation
flows down the wire into Agent 2, which executes it on-chain and anchors the proof.
Point out the key idea out loud (in the subtitles): the Analyst literally cannot move
funds, only the Executor can, and only within budget. That is separation of duties,
built by dragging two nodes.

## Scene 3: The Agent Council governs a treasury action, about 90 s

This is the climax. Build a council of three role-agents feeding one **Agent Council**
(consensus) node, then an action:

- **Risk agent**: tools = read balance, read price. Judges whether the payout is safe.
- **Compliance agent**: tools = read recent transfers. Judges whether limits and rules
  are respected.
- **Strategy agent**: tools = read price. Judges whether now is a good time.

The three feed an **Agent Council** node set to "require 2 of 3 approvals", with
ABSTAIN and ESCALATE as possible outcomes. Only on APPROVE does the flow continue to a
**Send CSPR** + **Attest** + **Telegram** chain.

Run it twice to show the governance is real:

1. **Healthy treasury**: all three approve, quorum met, payout executes, the council's
   verdict and every transaction are anchored on Casper, Telegram gets the full report.
2. **Stressed treasury** (lower the balance or raise the threshold): Risk votes no,
   quorum fails, the council returns ESCALATE, no funds move, and the escalation itself
   is anchored on-chain. "Refusing to act is a first-class, provable outcome."

## Scene 4: The proof, about 20 s

Open Telegram, click the attestation links, show the council's decision and the payout
transactions on cspr.live, all Success. Close on the canvas: three role-agents, one
council, one payout, every step provable on Casper.

---

## Why this demo wins

- It is visibly **multi-agent and autonomous**, the hottest theme in AI right now,
  but made accessible: no Rust, no orchestration code, just nodes on a canvas.
- It shows **separation of duties and governance**, which is exactly what a real
  treasury, payroll, or compliance team needs, and what serious judges look for.
- Every claim is **backed by an on-chain attestation**, so nothing is hand-wavy.
- It reframes the competition: a hand-coded multi-agent project becomes, in CasperFlow,
  a template anyone can build in minutes.

## Subtitle tone

Same as Demo 1: short, confident, explanatory, no voiceover. Lead lines to reuse:
"Give an agent a role and a toolset." "It picks the Casper actions itself." "The Analyst
cannot move funds. Only the Executor can." "Two of three must approve." "Refusing to act
is a provable outcome." "Every decision is anchored on Casper."

## Build order before filming

1. Autonomous Agent node (tool-use loop + role + scoped tools + guardrails).
2. Agent Council node (quorum + ABSTAIN/ESCALATE).
3. Auto-anchor each agent verdict on-chain (reuse the attestation primitive).
4. One ready-made "AI Treasury Council" template so the demo builds in seconds.
