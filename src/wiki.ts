// CasperFlow Wiki content.
// To document a new feature: add an entry to the relevant section (or a new section).
// Keep `keywords` rich — the search matches title, body, and keywords.

export interface WikiArticle {
  id: string
  title: string
  body: string // simple markdown-ish: paragraphs separated by \n\n, "- " for bullets
  keywords: string[]
}

export interface WikiSection {
  id: string
  title: string
  icon: string
  articles: WikiArticle[]
}

export const WIKI: WikiSection[] = [
  {
    id: 'basics',
    title: 'Getting started',
    icon: 'book',
    articles: [
      {
        id: 'overview',
        title: '★ CasperFlow at a glance (read this first)',
        body:
          'CasperFlow is the first no-code visual builder for autonomous AI agents on the Casper Network. You drag blocks onto a canvas, connect them, and get an agent that reads live data, reasons with an LLM, and signs real Casper transactions on a schedule — no code, no terminal.\n\nWHAT IS ACTUALLY REAL (not simulated, runs today on testnet):\n\n- Real signed Casper transactions, fully autonomous (local signing, no wallet popup): Send CSPR, Stake / delegate, Call contract, and EIP-712 Attestations anchored on-chain.\n- Real AI decisions via your own provider (Claude, GPT, Gemini, Grok, or any OpenAI-compatible endpoint) that read live context and gate or summarize actions.\n- Real on-chain reads: live CSPR price, account balances, incoming transfers — used as triggers and conditions.\n- Real outputs: Telegram and Discord notifications with on-chain proof links.\n- Wallets with weighted-key-friendly, per-action signing, multiple saved profiles, autonomous or ask-approval modes.\n\nWHAT MAKES IT DIFFERENT (the best of the best):\n\n- Verifiable AI: an agent can cryptographically anchor its AI decision on Casper (EIP-712 claim hash) before acting — an auditable, tamper-proof record of what the autonomous agent decided. This is the killer pattern for treasury, payroll and compliance use cases.\n- Truly autonomous: local signing means agents act 24/7 with no human in the loop and no popups — while still offering an in-app approval mode when a human gate is wanted.\n- Multi-agent reasoning: multiple AI nodes in one flow, each with its own output variable, can even feed each other (a guardian AI decides, a second AI explains).\n- Recipients by CSPR.name: send to alice.cspr (resolved via CSPR.cloud), a saved wallet, or a raw key.\n- x402 client (beta): agents can pay paid HTTP APIs per request via Casper x402 (EIP-712 TransferAuthorization) — the machine-to-machine agent economy, now that Casper joined the x402 Foundation.\n- Casper MCP server: a standalone Model Context Protocol server (published on npm as casperflow-mcp) exposes these same real Casper actions to any AI agent — nanobot, Claude, Cursor — turning CasperFlow into the Casper action layer for the whole agent ecosystem.\n\nWHY CASPER: predictable, low fixed fees and fast deterministic finality make scheduled, autonomous, high-frequency agent actions practical; the advanced account model (weighted keys, action thresholds) fits permissioned autonomous agents; and on-chain attestation turns AI reasoning into a verifiable enterprise record.\n\nBuildathon tracks covered: Agentic AI (verifiable AI agents), DeFi / Payments (autonomous transfers, staking, x402), and the rails for Real-World Assets. Explore the rest of this wiki for each action in detail.',
        keywords: ['overview', 'summary', 'features', 'capabilities', 'what can it do', 'presentation', 'pitch', 'cto', 'best', 'verifiable ai', 'autonomous', 'mcp', 'x402', 'no-code', 'casper', 'agent', 'highlights'],
      },
      {
        id: 'concepts',
        title: 'Core concepts in 60 seconds',
        body:
          'A few words you’ll see everywhere:\n\n- Action (also called a node or card): one block on the canvas. Triggers start a flow, logic shapes it, actions do things, outputs report.\n- Workflow / agent: a set of connected actions in one workspace.\n- Run: one pass through the workflow. "Go live" repeats runs on a schedule.\n- Variables: values that flow between actions ({{price}}, {{amount}}…).\n- Memory: variables that persist between runs.\n- Signing mode: whether an on-chain action runs autonomously or asks for your wallet approval.\n\nThat’s the whole mental model. Everything else is just more actions to choose from.',
        keywords: ['concepts', 'glossary', 'terms', 'node', 'action', 'workflow', 'run', 'basics', 'vocabulary'],
      },
      {
        id: 'safety-first',
        title: 'Safety & best practices',
        body:
          'A short checklist for running agents that touch money:\n\n- Start on testnet. Build and prove your agent with test CSPR before mainnet.\n- Use "Ask approval" for large or irreversible actions; keep "Autonomous" for small, frequent ones.\n- Add a Cooldown so an agent can’t act too often, and a Safety check before buying unknown tokens.\n- Add a Notification so you always know when your agent acted.\n- Review imported workflows — especially Custom code actions — before running them.\n- Keep limits tight: weighted keys mean an agent key can act but never drain your account.',
        keywords: ['safety', 'best practices', 'security', 'testnet', 'approval', 'cooldown', 'tips', 'checklist'],
      },
      {
        id: 'what-is',
        title: 'What is CasperFlow?',
        body:
          'CasperFlow is a visual, no-code canvas to build autonomous AI agents that run on the Casper Network. Think of it as "Zapier for on-chain money": you connect blocks — called actions — to define what your agent watches and what it does, without writing any code.\n\nAn agent is made of three kinds of actions chained together: a trigger (when to run), optional logic (conditions, AI decisions, delays), and one or more actions (swap, send, notify…).',
        keywords: ['intro', 'overview', 'zapier', 'no-code', 'agent', 'what'],
      },
      {
        id: 'build-with-ai',
        title: 'Build with AI',
        body:
          'In the new-agent gallery, describe what you want in plain language — "watch the CSPR price and alert me on Telegram if it drops below $0.018" — and CasperFlow asks your connected AI model to assemble the matching workflow automatically. Review the generated cards, adjust, and Run. Connect a model in Settings → AI to enable it. The fastest way from idea to working agent.',
        keywords: ['build with ai', 'natural language', 'describe', 'generate', 'ai builder', 'prompt', 'create'],
      },
      {
        id: 'ai-command-bar',
        title: 'AI command bar (describe & refine)',
        body:
          'The bar at the top of the canvas lets you build and refine your agent by talking to it, like iOS Shortcuts’ "Describe a Shortcut". Type an instruction — "add a Telegram alert when it sells", "insert a safety check before the swap", "remove the stake step", "only act once per day" — and the AI rewrites the current workflow accordingly, then re-arranges it. Keep refining with more instructions; each one updates the agent in place. Requires a model in Settings → AI.',
        keywords: ['command', 'bar', 'ai', 'describe', 'refine', 'edit', 'natural language', 'shortcuts', 'add', 'change', 'modify'],
      },
      {
        id: 'explain-run',
        title: 'Explain run',
        body:
          'The "Explain" button above the execution log asks your AI model to summarise, in plain language, what the agent just did and why — turning a technical log into a sentence anyone understands. Useful after a live cycle to confirm the agent behaved as intended. Requires a model in Settings → AI.',
        keywords: ['explain', 'summary', 'why', 'observability', 'understand', 'log', 'ai'],
      },
      {
        id: 'templates',
        title: 'Agent templates',
        body:
          'The fastest way to start: click "New workspace" in the workspace menu to open the template gallery. Pick a ready-made agent — CSPR Sentinel (price alert), DCA Accumulator, Stop-loss Protector, Staking Compounder, Launch Sniper, Downturn Hedger, or AI Trader — and it loads fully wired. Just configure the cards (thresholds, amounts) and Run or Go live. Choose "Blank canvas" to build your own from scratch.',
        keywords: ['template', 'gallery', 'starter', 'example', 'ready-made', 'preset', 'new'],
      },
      {
        id: 'build-first',
        title: 'Build your first agent',
        body:
          'Drag actions from the left palette onto the canvas. Connect them by dragging from the dot on the right of one card to the dot on the left of the next.\n\nEvery agent needs at least one purple trigger (Schedule, Price threshold, On-chain event…). Then click "Run once" to test it, or "Go live" to let it run continuously.\n\nDouble-click any card to flip it and configure its settings.',
        keywords: ['build', 'create', 'first', 'drag', 'connect', 'tutorial', 'how to'],
      },
      {
        id: 'offline',
        title: 'Sleep, offline & running 24/7',
        body:
          'A live agent runs inside this browser tab. CasperFlow protects it as much as a browser allows:\n\n- Screen wake lock: while the agent is live, CasperFlow asks the system to keep the screen awake, preventing most laptops from sleeping mid-run.\n- Offline detection: if the connection drops, cycles pause with a clear log entry; the moment you are back online, a catch-up cycle runs automatically.\n- Sleep detection: if the computer did sleep, the agent notices the time gap on wake, logs how many cycles were missed, and resumes immediately.\n\nHard limit: if the computer is fully asleep or off, no browser can keep running. True 24/7 operation requires CasperFlow Cloud (planned) — your agents run on a server and keep watching the market and sending alerts with your computer off.',
        keywords: ['offline', 'sleep', 'veille', '24/7', 'background', 'wake lock', 'cloud', 'always on', 'disconnect'],
      },
      {
        id: 'variables',
        title: 'Variables: passing data between actions',
        body:
          'Actions can share data within a run. When an action runs, it exposes values that later actions can reuse by writing {{name}} in any text field (message, endpoint, URL, AI question).\n\nAvailable variables include: {{price}} (live CSPR price), {{amount}} (CSPR amount of the last trade/transfer), {{net}} (net stablecoin received), {{balance}} (watched account balance), {{account}}, {{from}} (sender), {{cspr}} (CSPR bought by DCA), {{time}} and {{date}}.\n\nExample notification: "CSPR is at ${{price}} — your agent acted at {{time}}". The agent fills in the real values at run time. This makes a workflow read like a coherent story: a trigger captures the price, and the notification reports it.',
        keywords: ['variable', 'variables', 'data', 'pass', 'template', 'price', 'amount', 'placeholder', 'context', 'dynamic'],
      },
      {
        id: 'advanced-params',
        title: 'Advanced parameters',
        body:
          'Cards keep the essential settings visible so they stay simple. Each action that has professional-grade options shows an "Advanced" toggle on its back face — click it to reveal the full controls.\n\nExamples: Stop-loss adds trailing-stop and partial-sell; Perpetuals add take-profit, stop-loss and margin mode; Compliance gate adds lock-up, max transfer size and investor cap; Distribute adds payout token, management fee and minimum payout. Sensible defaults mean you only touch these when you need them.',
        keywords: ['advanced', 'parameters', 'settings', 'options', 'precision', 'trailing', 'partial', 'professional'],
      },
      {
        id: 'run-vs-live',
        title: 'Run once vs Go live',
        body:
          '"Run once" executes the whole workflow a single time — useful for testing.\n\n"Go live" turns your agent on: it runs automatically on the interval set in your Schedule action (every X minutes), cycle after cycle, as long as the browser tab stays open. A green LIVE badge shows it is active. Click "Stop agent" to end it.',
        keywords: ['run', 'live', 'go live', 'loop', 'cycle', 'schedule', 'autonomous', 'continuous'],
      },
    ],
  },
  {
    id: 'triggers',
    title: 'Triggers',
    icon: 'zap',
    articles: [
      {
        id: 'schedule',
        title: 'Schedule',
        body:
          'Runs the agent every X minutes. This is what defines the heartbeat of a live agent. Set the interval in the card settings (minimum 0.5 min).',
        keywords: ['schedule', 'timer', 'interval', 'every', 'minutes', 'cron'],
      },
      {
        id: 'price',
        title: 'Price threshold',
        body:
          'Triggers when the live CSPR price goes above, goes below, or exits a range you set. The real CSPR price is shown live on the card (updated every 30s) and on the back while you configure it, with a "rule met" indicator so you can tune the threshold against the real market. Use the "use live" button to fill in the current price.',
        keywords: ['price', 'threshold', 'cspr', 'live price', 'market', 'above', 'below', 'alert'],
      },
      {
        id: 'onchain',
        title: 'On-chain event',
        body:
          'Reacts to real-time events on Casper — transfers, contract deploys, contract calls — above a minimum amount. Backed by the CSPR.cloud streaming layer (real data when a CSPR.cloud key is set in Settings → Casper).',
        keywords: ['on-chain', 'event', 'transfer', 'contract', 'stream', 'real-time'],
      },
      {
        id: 'oracle',
        title: 'Oracle price (Styks)',
        body:
          'Like Price threshold, but the price reference is Styks — Casper’s first on-chain price oracle — instead of an external market API. On-chain oracle data is what smart contracts themselves rely on, making it the most credible trigger for serious strategies. (Oracle route simulated for now.)',
        keywords: ['oracle', 'styks', 'on-chain', 'price', 'trigger'],
      },
      {
        id: 'nftwatch',
        title: 'NFT event (CEP-78)',
        body:
          'Watches a CEP-78 NFT collection for Mint, Transfer or Burn events — Casper’s NFT standard has native event tracking. Use it to get alerted when someone mints in a collection you follow, or to react to transfers of your own NFTs. Exposes {{nftEvent}} and {{tokenId}}.',
        keywords: ['nft', 'cep-78', 'mint', 'transfer', 'burn', 'collection', 'watch'],
      },
      {
        id: 'launchwatch',
        title: 'New token launch (Ghostminter)',
        body:
          'Fires when a new CEP-18 token launches on Ghostminter, Casper’s bonding-curve launchpad. Combine with a Notification for instant launch alerts, or with an AI decision to evaluate the launch before acting. Exposes {{token}}.',
        keywords: ['launch', 'token', 'ghostminter', 'launchpad', 'sniper', 'new', 'cep-18'],
      },
      {
        id: 'pegmonitor',
        title: 'Stablecoin peg',
        body:
          'Fires when a stablecoin (USDC/USDT) drifts off its $1 peg by more than your threshold — an early-warning siren for depeg events like UST/Terra. Chain it to a Stop-loss or "CSPR → stablecoin" reversal to protect funds the moment a peg breaks. Exposes {{deviation}}.',
        keywords: ['peg', 'depeg', 'stablecoin', 'usdc', 'usdt', 'alert', 'protect', 'ust', 'terra'],
      },
      {
        id: 'govwatch',
        title: 'Governance vote',
        body:
          'Fires when a new Casper governance vote opens (like CVV-008 which set the current inflation split). Never miss a vote that affects your stake. Exposes {{vote}}.',
        keywords: ['governance', 'vote', 'cvv', 'proposal', 'alert'],
      },
      {
        id: 'balance',
        title: 'Balance change',
        body:
          'Watches a Casper account and reads its real on-chain balance. With a CSPR.cloud API key and a watched account set in Settings → Casper, this reads live data from testnet or mainnet. Without a key, it runs in simulation.',
        keywords: ['balance', 'account', 'wallet', 'watch', 'on-chain', 'real', 'cspr.cloud'],
      },
      {
        id: 'incoming',
        title: 'Incoming transfer',
        body:
          'Fires when the watched account receives a transfer above a minimum amount. Reads the real recent transfers of the account via CSPR.cloud when configured.',
        keywords: ['incoming', 'transfer', 'received', 'deposit', 'payment', 'real'],
      },
    ],
  },
  {
    id: 'logic',
    title: 'Logic',
    icon: 'branch',
    articles: [
      {
        id: 'safety',
        title: 'Safety check',
        body:
          'Screens a token or contract before your agent touches it: honeypot detection, sell-tax limit, liquidity floor, and (advanced) holder concentration. If it fails, the branch stops — your agent never buys a scam. Place it right after a "New token launch" trigger or before any swap.',
        keywords: ['safety', 'honeypot', 'scam', 'rug', 'sell tax', 'liquidity', 'screen', 'risk', 'check'],
      },
      {
        id: 'trust',
        title: 'Trust score',
        body:
          'Scores the reputation of an address (0–100) from on-chain history — wallet age, transaction history, counterparties — and only continues if it meets your minimum. Use it to vet a sender before accepting a transfer or a counterparty before settling.',
        keywords: ['trust', 'score', 'reputation', 'address', 'counterparty', 'risk', 'vet'],
      },
      {
        id: 'condition',
        title: 'Condition',
        body: 'A simple if/else gate. If the rule is true, the branch continues; if false, it stops there.',
        keywords: ['condition', 'if', 'else', 'gate', 'branch', 'rule'],
      },
      {
        id: 'ai',
        title: 'AI decision',
        body:
          'Asks an AI model a question about the live situation and continues only if the answer is favourable — letting your agent reason about context instead of following rigid rules.\n\nConnect a model in Settings → AI (Claude, ChatGPT, Gemini, Grok, or a Custom OpenAI-compatible provider) with your own API key. For the Custom option you set your own base URL (e.g. AlterHQ) and model name — any endpoint that speaks the OpenAI chat format works. The action sends the question plus live context (current CSPR price, time) and the model replies with a proceed/stop decision and a one-line reason, shown in the log. Without a key it runs in simulation. Claude works directly in the browser; other providers may need the backend (coming).',
        keywords: ['ai', 'claude', 'chatgpt', 'openai', 'gemini', 'grok', 'custom', 'alterhq', 'base url', 'decision', 'reason', 'llm', 'brain', 'smart', 'model'],
      },
      {
        id: 'setvar',
        title: 'Set variable (with memory)',
        body:
          'Creates or updates a named value — no code or symbols needed. Just pick a name and an operation in plain language:\n\n- Count up (+1 each run): the simplest counter.\n- Add amount / Subtract amount / Multiply by: arithmetic on the current value.\n- Set to a number / Set to text: assign a fixed value.\n- Copy another variable: take the value of a variable you name.\n\nTurn on "Remember across runs" to keep the value in memory between cycles. This unlocks real stateful logic:\n\n- Counters: name "count", operation "Count up" → counts how many times the agent acted; gate it with a Condition (e.g. stop after 3 trades/day).\n- Trailing stop: store the highest price seen and sell if price drops a % from it.\n- Average entry tracking across multiple buys.\n\nTo use a variable elsewhere (a message, an AI question), click the variable chips under the text field — no need to type anything by hand.',
        keywords: ['variable', 'set', 'memory', 'persist', 'counter', 'operation', 'add', 'count', 'trailing', 'state', 'remember', 'accumulate', 'easy'],
      },
      {
        id: 'code',
        title: 'Custom code (JS) — overview',
        body:
          'A blank action where you write your own JavaScript to do anything CasperFlow doesn’t have a card for. Your code is not just a calculator — it gets a toolkit object called cf that can read live data, call the AI, send notifications, read balances and fetch the web.\n\nYour code returns an object:\n\nreturn { output: "text shown in the log", pass: true, vars: { myValue: 42 } }\n\n- output: what to show in the execution log.\n- pass: true to continue the branch, false to stop it.\n- vars: values you expose to later actions (use them as {{myValue}}).\n\nYour code can be async — use await freely. See "Custom code: the cf toolkit" for the full API and the tutorials below.\n\nSecurity: only run code you wrote or reviewed. When you import a shared workflow that contains code actions, CasperFlow warns you — always read the code (double-click the card) before running.',
        keywords: ['code', 'javascript', 'js', 'custom', 'advanced', 'script', 'program', 'developer', 'cf', 'toolkit'],
      },
      {
        id: 'code-api',
        title: 'Custom code: the cf toolkit (API)',
        body:
          'Everything your code can use, via the cf object:\n\n- cf.price — the live CSPR price (number or null).\n- cf.vars — all run variables so far (read). e.g. cf.vars.amount.\n- cf.memory — an object that persists across runs (read AND write). cf.memory.count = (cf.memory.count || 0) + 1.\n- cf.net — "testnet" or "mainnet".\n- cf.log(msg) — add a note to the execution log.\n- await cf.ai(question) — ask the AI a yes/no question, returns "yes" / "no".\n- await cf.ask(prompt) — ask the AI for free text, returns the answer string.\n- await cf.notify(message) — send a message via your configured Telegram/Discord.\n- await cf.getBalance(publicKey) — real on-chain balance (needs a CSPR.cloud key), returns CSPR number or null.\n- await cf.http(url) — fetch a URL and parse JSON (subject to the site allowing browser requests).\n\nReturn { output, pass, vars }. Anything you put in vars or cf.memory flows to later actions / future runs.',
        keywords: ['code', 'api', 'cf', 'toolkit', 'memory', 'ai', 'notify', 'getbalance', 'http', 'reference', 'sdk'],
      },
      {
        id: 'code-tut-counter',
        title: 'Code tutorial: a counter with memory',
        body:
          'Count how many times the agent has run, and stop after 5:\n\ncf.memory.runs = (cf.memory.runs || 0) + 1\nreturn {\n  output: "run #" + cf.memory.runs,\n  pass: cf.memory.runs <= 5,\n  vars: { runs: cf.memory.runs }\n}\n\ncf.memory survives between live cycles, so the count keeps growing. (You can also do this with the no-code "Set variable" action.)',
        keywords: ['code', 'tutorial', 'counter', 'memory', 'example', 'runs', 'limit'],
      },
      {
        id: 'code-tut-fetch',
        title: 'Code tutorial: fetch external data',
        body:
          'Pull data from any API and act on it. Example — read a number from a JSON endpoint and pass it on:\n\nconst data = await cf.http("https://api.example.com/metric")\nif (!data) return { output: "fetch failed", pass: false }\nreturn {\n  output: "metric = " + data.value,\n  pass: data.value > 100,\n  vars: { metric: data.value }\n}\n\nNote: the target site must allow browser requests (CORS). Public, open APIs work; many private ones need the backend (coming).',
        keywords: ['code', 'tutorial', 'fetch', 'http', 'api', 'external', 'data', 'cors'],
      },
      {
        id: 'code-tut-ai',
        title: 'Code tutorial: reason with AI',
        body:
          'Let the AI decide inside your code, then notify yourself:\n\nconst verdict = await cf.ai("Given CSPR at $" + cf.price + ", is this a dip worth buying?")\nif (verdict === "yes") {\n  await cf.notify("AI says buy — CSPR at $" + cf.price)\n}\nreturn { output: "AI said " + verdict, pass: verdict === "yes" }\n\nUse cf.ask(prompt) instead of cf.ai when you want a full text answer rather than yes/no. Requires a model in Settings → AI.',
        keywords: ['code', 'tutorial', 'ai', 'reason', 'notify', 'decision', 'claude', 'example'],
      },
      {
        id: 'code-tut-trailing',
        title: 'Code tutorial: a trailing stop',
        body:
          'A real trailing stop using memory — sells if the price falls 5% from the highest level seen:\n\nconst peak = Math.max(cf.memory.peak || 0, cf.price)\ncf.memory.peak = peak\nconst drop = (peak - cf.price) / peak * 100\nconst hit = drop >= 5\nif (hit) cf.memory.peak = 0 // reset after firing\nreturn {\n  output: "peak $" + peak.toFixed(4) + ", now -" + drop.toFixed(1) + "%",\n  pass: hit,\n  vars: { peak }\n}\n\nWire its output into a Stop-loss or "CSPR → stablecoin" action to actually sell.',
        keywords: ['code', 'tutorial', 'trailing', 'stop', 'peak', 'memory', 'sell', 'strategy'],
      },
      {
        id: 'code-tut-balance',
        title: 'Code tutorial: react to a real balance',
        body:
          'Read a real on-chain balance and branch on it (needs a CSPR.cloud key in Settings → Casper):\n\nconst bal = await cf.getBalance("0202f5a9…")\nif (bal === null) return { output: "no balance data", pass: false }\nawait cf.notify("Balance is " + bal + " CSPR")\nreturn { output: bal + " CSPR", pass: bal > 1000, vars: { balance: bal } }',
        keywords: ['code', 'tutorial', 'balance', 'getbalance', 'on-chain', 'real', 'notify', 'example'],
      },
      {
        id: 'delay',
        title: 'Delay',
        body: 'Pauses the workflow for a set number of minutes before continuing to the next step.',
        keywords: ['delay', 'wait', 'pause', 'timer'],
      },
      {
        id: 'cooldown',
        title: 'Cooldown',
        body:
          'Prevents the agent from acting too often: allows the branch to continue at most once every N hours. Essential safety rail to avoid repeated actions.',
        keywords: ['cooldown', 'rate limit', 'once', 'safety', 'throttle'],
      },
    ],
  },
  {
    id: 'actions',
    title: 'Casper actions',
    icon: 'hexagon',
    articles: [
      {
        id: 'signing-approval',
        title: 'Signing: autonomous vs ask approval',
        body:
          'Every Casper action can run in one of two signing modes (flip the card to set it):\n\n- Autonomous: the agent signs and submits the transaction itself, using a dedicated agent key — no human in the loop. Ideal for small, frequent actions (micropayments, DCA, alerts).\n- Ask approval: the agent prepares the transaction and requests your signature in your wallet before it executes. Ideal for large or sensitive actions. In auto-run, these are logged as "approval required" and skipped until you sign.\n\nThis is powered by Casper’s weighted keys: a dedicated agent key can be associated with your account at limited permissions, so even in autonomous mode the chain itself bounds what the agent can do — it can act, but never drain your account.',
        keywords: ['signing', 'approval', 'autonomous', 'wallet', 'weighted keys', 'security', 'sign', 'permission', 'safe'],
      },
      {
        id: 'execution-model',
        title: 'How execution & costs work',
        body:
          'Every swap and trading action models the real cost of a CSPR.trade (Uniswap-V2 style) swap, so what you see in the log reflects reality, not a fantasy:\n\n- LP fee: 0.30% of the swap, paid to liquidity providers.\n- Price impact: the larger your order relative to pool depth, the more it moves the price against you (constant-product formula).\n- Slippage tolerance: the max adverse move you accept before the swap reverts.\n\nThe execution log shows the gross value, the fee deducted, the price impact %, and the net amount received — exactly like a real DEX confirmation.',
        keywords: ['cost', 'fee', 'lp fee', 'slippage', 'price impact', 'spread', 'execution', 'dex', 'amm', 'real'],
      },
      {
        id: 'stoploss',
        title: 'Stop-loss (protect to stablecoin)',
        body:
          'Sells your CSPR position into a stablecoin (USDC/USDT) if the price falls a set % below your entry price — capping your loss. Set the entry price (use the "use live" button to grab the current price), the trigger drop %, the position size, and max slippage.\n\nThe action only fires when the live price is at or below your stop level; otherwise it logs "Holding" and stops the branch. When it fires, it shows the full execution breakdown (fee, impact, net stablecoin received).',
        keywords: ['stop-loss', 'stop loss', 'protect', 'downside', 'stablecoin', 'usdc', 'sell', 'risk', 'hedge'],
      },
      {
        id: 'takeprofit',
        title: 'Take-profit (lock gains)',
        body:
          'Sells your CSPR into a stablecoin if the price rises a set % above your entry — locking in profit. Set entry, target gain %, position size and slippage. Fires only when the live price reaches your target, and reports the realised profit after fees.',
        keywords: ['take-profit', 'take profit', 'lock', 'gains', 'sell', 'target', 'profit', 'stablecoin'],
      },
      {
        id: 'dca',
        title: 'DCA buy (dollar-cost averaging)',
        body:
          'Buys a fixed dollar amount of CSPR with your stablecoin every run — the classic accumulation strategy that smooths out volatility. Pair it with a Schedule trigger (e.g. weekly) to auto-accumulate. Shows the CSPR received after fees and price impact.',
        keywords: ['dca', 'dollar cost averaging', 'accumulate', 'buy', 'recurring', 'invest'],
      },
      {
        id: 'limitorder',
        title: 'Limit order',
        body:
          'The classic exchange order, on the DEX: "Buy 500 CSPR if the price reaches $0.018" or "Sell if it reaches $0.03". The order waits (logging its status each cycle) until the live price crosses your target, then fills with the full cost breakdown. Pair with Go live so it keeps watching for you.',
        keywords: ['limit', 'order', 'buy', 'sell', 'target', 'price', 'exchange'],
      },
      {
        id: 'perp',
        title: 'Perpetuals LONG/SHORT (Casper Delta)',
        body:
          'Opens a leveraged LONG or SHORT position on Casper Delta, the perpetuals platform live on Casper. Set position size, leverage, and the card computes your estimated liquidation price and opening fee.\n\nKey use: hedging — instead of selling your CSPR in a downturn, a SHORT position profits when price falls, offsetting your losses while you keep your stack. Combine: Price threshold (goes below) → Perp SHORT. (Testnet, simulated for now.)',
        keywords: ['perp', 'perpetual', 'long', 'short', 'leverage', 'delta', 'hedge', 'liquidation', 'futures'],
      },
      {
        id: 'compound',
        title: 'Auto-compound staking',
        body:
          'Claims your staking rewards and re-delegates them automatically — compound interest on autopilot (~11% APY on Casper). The "compound when rewards ≥ X" threshold avoids wasting fees on tiny claims. Pair with a weekly Schedule. Exposes {{rewards}}.',
        keywords: ['compound', 'staking', 'rewards', 'restake', 'apy', 'yield', 'harvest', 'auto'],
      },
      {
        id: 'predict',
        title: 'Prediction bet (CSPR.guru)',
        body:
          'Places a Yes/No stake on a CSPR.guru prediction market. The killer combo: gate it with an AI decision so the model evaluates the question before your agent bets — an AI forecaster on Casper. (Testnet, simulated for now.)',
        keywords: ['prediction', 'bet', 'market', 'cspr.guru', 'forecast', 'yes', 'no'],
      },
      {
        id: 'rebalance-strategy',
        title: 'Strategy: protect & re-enter',
        body:
          'A complete, viable agent combining the building blocks:\n\n- Branch A — Schedule → Stop-loss (entry $0.020, drop 5%): protects your stack if CSPR dumps, moving it to USDC.\n- Branch B — Schedule → DCA buy ($50): keeps accumulating CSPR on the way, smoothing your average price.\n- Branch C — Schedule → Take-profit (entry $0.020, gain 20%): sells a slice into USDC when CSPR pumps.\n\nAdd a Cooldown action so it can act at most once per day, and a Notification so you get a Telegram every time it trades. This mirrors how 3Commas / Pionex SmartTrade bots are built — now no-code, on Casper.',
        keywords: ['strategy', 'rebalance', 'protect', 're-enter', 'bot', '3commas', 'pionex', 'smarttrade', 'example'],
      },
      {
        id: 'swap',
        title: 'CSPR.trade swap',
        body:
          'Swaps tokens on CSPR.trade, the native Casper DEX, through its OFFICIAL TypeScript SDK (@make-software/cspr-trade-mcp-sdk). The flow is fully non-custodial and matches CasperFlow’s model: the SDK builds the unsigned swap transaction remotely, your connected Wallet signs it locally (no key ever leaves your machine), and it’s submitted to the network. Set the From token, To token, amount, max slippage and deadline. If a CEP-18 approval is needed first, the action handles it automatically.\n\nTestnet is free — point the network at testnet to swap without spending real value. The SDK also returns route, price-impact and safety warnings, which appear in the log.\n\nStatus: BETA. First-time setup: run npm install (a new dependency, @make-software/cspr-trade-mcp-sdk, was added). The exact transaction format and any browser CORS to the CSPR.trade API are confirmed on the first real run (a proxy fixes CORS if needed). CSPR.trade also ships an official MCP server (mcp.cspr.trade) so AI agents can do DEX operations directly — composable with CasperFlow’s own MCP.',
        keywords: ['swap', 'dex', 'cspr.trade', 'exchange', 'trade', 'slippage', 'sdk', 'non-custodial', 'mcp', 'testnet', 'uniswap', 'agentic defi'],
      },
      {
        id: 'quote',
        title: 'Get swap quote (real, free)',
        body:
          'Reads the LIVE on-chain DEX rate for a token pair from CSPR.cloud and computes the expected output — real data, read-only, free (testnet or mainnet). No transaction, nothing spent.\n\nSet the From token and To token as their CEP-18 contract package hashes (find them on cspr.live), the input amount, and optionally the DEX id. The action outputs the expected amount out and the rate, and exposes {{quote}} and {{rate}} variables for downstream AI decisions or conditions. Needs a CSPR.cloud key (Settings → Integrations → Casper).',
        keywords: ['quote', 'price impact', 'estimate', 'dex', 'real', 'rate', 'cspr.cloud', 'free', 'read-only'],
      },
      {
        id: 'transfer',
        title: 'Send CSPR',
        body:
          'Sends a native CSPR transfer to a recipient public key. Supports a transfer ID (the on-chain memo exchanges use to attribute deposits), the fixed 0.1 CSPR native transfer fee, and an optional "only if balance ≥" guard. Settlement is final the moment it’s validated (deterministic finality). Real signed testnet transaction when connected to a Wallet node with live execution on.',
        keywords: ['send', 'transfer', 'pay', 'cspr', 'recipient', 'memo', 'transfer id', 'fee'],
      },
      {
        id: 'attest',
        title: 'Attest on Casper',
        body:
          'Anchors a verifiable proof of your agent’s decision or data on Casper — the pattern behind most of the strongest agentic projects (treasury verdicts, oracle readings, risk decisions), but in no-code. It computes a standards-compliant EIP-712 attestation following Casper’s official casper-eip-712 toolkit — Attestation(address subject, bytes32 claim_hash), where claim_hash = keccak256 of the content you attest. It then anchors a timestamped, immutable proof on Casper testnet (real signed transactions whose deploy hashes + time prove the agent committed that exact decision), and exposes {{claimhash}}, {{digest}} and {{attesturl}} so a downstream Notification can broadcast the proof link. Connect it to a Wallet node and enable “Execute real transactions” for a real on-chain anchor. Auditable by anyone, manipulable by no one.\n\nOn-chain anchor mode: "Full digest (4 tx)" records the COMPLETE 256-bit EIP-712 digest on-chain by splitting it across 4 native self-transfers (8 bytes per transfer-id) — so the full hash is permanently stored and reconstructable from the chain, not just committed to. To verify: read the 4 self-transfers’ transfer-ids in order, render each as a 16-hex (8-byte) value, concatenate → the 64-hex EIP-712 digest, then recompute keccak256 of the attested content and check it matches. "Commitment (1 tx)" is the cheaper mode: a single 48-bit transfer-id derived from the digest (1 transfer instead of 4). No custom contract or toolchain needed — it uses Casper’s native transfer memo field.',
        keywords: ['attest', 'attestation', 'proof', 'eip-712', 'eip712', 'verify', 'verifiable', 'claim', 'hash', 'keccak', 'audit', 'oracle', 'on-chain', 'record'],
      },
      {
        id: 'callcontract',
        title: 'Call contract',
        body:
          'Calls any entry point of any deployed Casper contract with JSON arguments — the universal action that lets your agent interact with contracts CasperFlow doesn’t have a dedicated card for. Set the contract hash, the entry point name (e.g. transfer, mint), and the arguments.',
        keywords: ['call', 'contract', 'entry point', 'invoke', 'method', 'interact', 'custom'],
      },
      {
        id: 'bridge',
        title: 'Bridge assets',
        body:
          'Moves assets cross-chain from Casper to Ethereum, BNB Chain, Polygon or Solana (via Ferrum or best route): funds are locked on Casper and minted on the destination. Opens cross-chain strategies — e.g. bridge profits to where you spend them. (Simulated for now.)',
        keywords: ['bridge', 'cross-chain', 'ethereum', 'solana', 'ferrum', 'transfer', 'interoperability'],
      },
      {
        id: 'stake',
        title: 'Stake / delegate',
        body:
          'Delegate, undelegate or redelegate CSPR to a validator. Models Casper’s real staking rules: minimum 3 CSPR delegation, the validator’s delegation rate deducted from your ~11% APY, the fixed 2.5 CSPR delegation fee, and the 7-era (~14h) unbonding period during which undelegated funds earn no rewards. Redelegation moves stake between validators without the unbonding wait. Pair with Auto-compound to restake rewards.',
        keywords: ['stake', 'delegate', 'undelegate', 'redelegate', 'validator', 'rewards', 'apy', 'unbonding', 'staking'],
      },
      {
        id: 'x402',
        title: 'x402 payment',
        body:
          'Pays a paid API endpoint per request via Casper’s x402 micropayment protocol — the agent economy in action. The flow is the real x402 handshake: the agent calls the endpoint; if it returns HTTP 402 with payment requirements, the agent signs an EIP-712 TransferAuthorization (EIP-3009 style) with its Wallet key, replays the request with the payment header, the facilitator settles a CEP-18 transfer on Casper, and the protected data returns. If the endpoint is free (HTTP 200) it just returns the data, no payment.\n\nHow to use: connect a Wallet (Autonomous) before the x402 action, set the endpoint URL and your max price, and turn on real execution. The EIP-712 signing uses Casper’s official @casper-ecosystem/casper-eip-712 standard, so authorizations are exactly what the facilitator expects.\n\nStatus: BETA. The 402 handshake and EIP-712 signing follow the official Casper x402 spec (make-software/casper-x402). To run end-to-end you point it at a live x402 facilitator + paid endpoint — free on testnet by running the project’s Go demo locally, or any hosted testnet facilitator. The exact payment-payload wire format may need a small tweak once validated against a running facilitator. Casper recently joined the x402 Foundation, so expect this to mature fast.\n\nFirst-time setup: run npm install (a new dependency, @casper-ecosystem/casper-eip-712, was added).',
        keywords: ['x402', 'micropayment', 'pay per request', 'api', 'machine', 'http 402', 'eip-712', 'eip-3009', 'facilitator', 'cep-18', 'transferauthorization', 'agentic', 'foundation'],
      },
    ],
  },
  {
    id: 'rwa',
    title: 'Real-world assets (RWA)',
    icon: 'building',
    articles: [
      {
        id: 'rwa-intro',
        title: 'Why RWA on Casper',
        body:
          'Real-world asset tokenization is Casper’s central focus: bringing real estate, royalties, funds and securities on-chain with compliance built in. CasperFlow turns these flows into no-code automations — distributing income to holders, enforcing KYC on transfers, and issuing compliant tokens — so an asset manager or a creator can run them without a developer.',
        keywords: ['rwa', 'real-world', 'tokenization', 'institutional', 'compliance', 'casper', 'manifest'],
      },
      {
        id: 'compliance',
        title: 'Compliance gate (ERC-3643)',
        body:
          'A faithful model of the ERC-3643 (T-REX) check that runs before any security-token transfer. It verifies the recipient against the on-chain identity registry: the required claims (KYC, AML, accreditation) issued by a trusted issuer, the allowed jurisdiction (EU/MiCA, US Reg D, US Reg S, global KYC), and — in advanced options — max transfer size, lock-up, investor cap, and whether the account is frozen or the token paused. If the check fails, canTransfer() returns false and the branch halts (or flags for review). This is exactly the institutional-grade enforcement Casper is built for, where restrictions follow the token itself. Exposes {{compliant}}.',
        keywords: ['compliance', 'erc-3643', 'kyc', 'jurisdiction', 'security token', 'mica', 'regulation', 'gate', 'accredited'],
      },
      {
        id: 'distribute',
        title: 'Distribute to holders',
        body:
          'Splits a revenue amount pro-rata across all token holders of an asset — rent (fractional real estate), royalties (music/IP), or dividends. Settlement is instant thanks to Casper’s deterministic finality. Pair with an "Incoming transfer" trigger so distribution runs automatically when income arrives. Exposes {{distributed}}, {{holders}}, {{perHolder}}.',
        keywords: ['distribute', 'rent', 'royalties', 'dividends', 'holders', 'split', 'fractional', 'real estate', 'income', 'payout'],
      },
      {
        id: 'issue',
        title: 'Issue security token',
        body:
          'Tokenizes an asset into shares (e.g. a building into 10,000 shares at $50) as an ERC-3643 security token with compliance rules attached, or a CEP-18 utility token. This is the entry point of any RWA workflow — define the asset, then automate its income and transfers. Exposes {{asset}}, {{shares}}, {{marketCap}}.',
        keywords: ['issue', 'tokenize', 'security token', 'shares', 'erc-3643', 'cep-18', 'fractional', 'asset', 'fund'],
      },
      {
        id: 'onboard',
        title: 'Onboard investor',
        body:
          'Registers an investor in the ERC-3643 identity registry: creates their ONCHAINID, issues the required claims (KYC, AML, accreditation) from a trusted issuer, and records their type and country. Only onboarded, claim-holding investors can receive a security token — this is the entry gate of any compliant offering.',
        keywords: ['onboard', 'investor', 'kyc', 'identity', 'onchainid', 'claims', 'register', 'accredited'],
      },
      {
        id: 'primarysale',
        title: 'Primary sale (subscription)',
        body:
          'Runs a primary offering: sells newly issued shares of an asset to verified investors, in USDC/USDT/CSPR, with soft cap, hard cap and an offering window. Each subscription is gated by the compliance check, and allocations are minted only to compliant investors. This is how capital is raised on-chain.',
        keywords: ['primary', 'sale', 'subscription', 'offering', 'raise', 'ico', 'sto', 'cap', 'allocation'],
      },
      {
        id: 'freeze',
        title: 'Freeze / unfreeze',
        body:
          'Freezes an account fully or a partial token amount (or unfreezes it) — the enforcement tool regulators require. Used for sanctions hits, disputes or legal holds. Enforced on-chain by the token agent, a core ERC-3643 capability.',
        keywords: ['freeze', 'unfreeze', 'sanctions', 'block', 'hold', 'enforce', 'agent'],
      },
      {
        id: 'forcetransfer',
        title: 'Force transfer (recovery)',
        body:
          'Moves tokens from one account to another by agent authority — for lost-wallet recovery, court orders, inheritance, or correcting erroneous transfers. The recipient must still be compliance-cleared. This is ERC-3643 forcedTransfer, the feature that makes institutions comfortable: assets are never truly lost.',
        keywords: ['force', 'transfer', 'recovery', 'lost wallet', 'court', 'inheritance', 'forcedtransfer', 'agent'],
      },
      {
        id: 'pausetoken',
        title: 'Pause / unpause token',
        body:
          'Halts (or resumes) all transfers of a token at the contract level — an emergency control for regulatory holds or incident response. Nothing moves until unpaused.',
        keywords: ['pause', 'unpause', 'halt', 'emergency', 'freeze all', 'regulatory'],
      },
      {
        id: 'corporate',
        title: 'Corporate action',
        body:
          'Executes a share split, reverse split, buyback, or redemption at maturity across all holders pro-rata, updating the cap table atomically thanks to deterministic finality. The on-chain equivalent of a registrar’s corporate-action processing.',
        keywords: ['corporate action', 'split', 'buyback', 'redemption', 'maturity', 'dividend', 'cap table'],
      },
      {
        id: 'capitalcall',
        title: 'Capital call',
        body:
          'Issues a capital call to fund investors (LPs): requests a percentage of committed capital, payable in stablecoin within a deadline. On-chain escrow tracks who has funded. Essential for private-equity and real-estate fund structures.',
        keywords: ['capital call', 'fund', 'lp', 'commitment', 'private equity', 'drawdown'],
      },
      {
        id: 'nav',
        title: 'NAV / valuation update',
        body:
          'Publishes an updated net asset value per share on-chain (from an appraiser, the Styks oracle, or the board) so holders and DeFi protocols price the asset correctly. Without a trusted on-chain valuation, RWA tokens can’t be used as collateral or marked to market.',
        keywords: ['nav', 'valuation', 'appraisal', 'price', 'mark to market', 'oracle', 'value'],
      },
      {
        id: 'rwareport',
        title: 'Compliance report',
        body:
          'Generates a cap-table snapshot, transfer audit trail, investor statement or regulatory filing from the on-chain record — every transfer carries a verifiable signature trail, so reporting is auditable by design. Delivered to the issuer, auditor or regulator.',
        keywords: ['report', 'audit', 'cap table', 'statement', 'regulatory', 'filing', 'compliance', 'trail'],
      },
      {
        id: 'x402offer',
        title: 'Publish x402 service (machine economy)',
        body:
          'Turns your workflow into a paid service: other AI agents discover your endpoint, pay a small amount per request via x402, and get the data — your agent earns CSPR autonomously. This closes the machine-economy loop Casper is built for: one agent builds a service, another pays to use it. Exposes {{earned}}.',
        keywords: ['x402', 'publish', 'service', 'machine economy', 'agent', 'earn', 'monetize', 'endpoint', 'micropayment', 'sell'],
      },
    ],
  },
  {
    id: 'outputs',
    title: 'Outputs & alerts',
    icon: 'bell',
    articles: [
      {
        id: 'notification',
        title: 'Notification (Telegram / Email)',
        body:
          'Sends a message when the agent acts. Telegram is fully working: set your bot token and chat ID in Settings → Alerts, and the agent sends real messages to your phone.',
        keywords: ['notification', 'telegram', 'email', 'alert', 'message', 'real'],
      },
      {
        id: 'discord',
        title: 'Discord message',
        body:
          'Posts a message to a Discord channel via a webhook. Paste a webhook URL on the card or in Settings → Alerts. Fully working.',
        keywords: ['discord', 'webhook', 'message', 'channel', 'real'],
      },
      {
        id: 'webhook',
        title: 'HTTP webhook',
        body: 'Sends an HTTP POST with the run payload to any URL — connect CasperFlow to your own systems.',
        keywords: ['webhook', 'http', 'post', 'integration', 'api'],
      },
    ],
  },
  {
    id: 'canvas',
    title: 'Canvas & workspaces',
    icon: 'layout',
    articles: [
      {
        id: 'interactions',
        title: 'Canvas interactions',
        body:
          '- Drag from the palette to add an action.\n- Connect two actions by dragging between their dots.\n- Right-click an action, a link, a group or the canvas for context options.\n- Double-click an action to configure it; double-click empty canvas to close open cards.\n- Resize an action by dragging its bottom-right corner.\n- Pan/Select modes are in the bottom toolbar (hand = move view, cursor = box-select).',
        keywords: ['canvas', 'drag', 'connect', 'right-click', 'resize', 'pan', 'select', 'zoom'],
      },
      {
        id: 'toolbar',
        title: 'Toolbar actions',
        body:
          'The bottom toolbar offers: Pan/Select modes, Undo/Redo (Cmd+Z / Cmd+Shift+Z), Group/Ungroup, Tidy layout (auto-arrange), Duplicate (Cmd+D), Add note, and Delete.',
        keywords: ['toolbar', 'undo', 'redo', 'tidy', 'duplicate', 'note', 'delete', 'shortcuts'],
      },
      {
        id: 'groups',
        title: 'Groups & notes',
        body:
          'Select multiple actions (Cmd+click or box-select) and group them into a labelled frame to organise big agents. Drag an action into a frame to add it, drag it out to remove it. Resize the frame from its corner. Add sticky notes to annotate your workflow.',
        keywords: ['group', 'note', 'organise', 'frame', 'annotate', 'label'],
      },
      {
        id: 'workspaces',
        title: 'Workspaces & import/export',
        body:
          'The workspace selector (next to the logo) lets you keep several agents side by side: create, rename, duplicate, delete and switch between them. Export any agent to a JSON file to back it up or share it, and import a JSON file to load someone else’s agent. This is the foundation of the future template marketplace.',
        keywords: ['workspace', 'import', 'export', 'json', 'save', 'share', 'backup', 'marketplace'],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings & connections',
    icon: 'gear',
    articles: [
      {
        id: 'interface-settings',
        title: 'Interface settings',
        body:
          'Settings → Interface: adjust interface size, toggle the minimap, grid, animated connections, magnetic grid (snap), node-overlap prevention, and colored connections.',
        keywords: ['settings', 'interface', 'size', 'minimap', 'grid', 'snap', 'colored'],
      },
      {
        id: 'live-execution',
        title: 'Live, Beta & Soon: what really works',
        body:
          'Every card shows a pill telling you how real it is:\n\n- Live (green): works for real now. Logic, AI, notifications, real data reads (price, balance), and real signed transactions — Send CSPR, Stake/delegate, and Call contract.\n- Beta (amber): partial / best-effort integration — CSPR.trade swap & quote, x402, stablecoin peg. May fall back to simulation.\n- Soon (grey): preview only, greyed in the palette. These depend on third-party contracts or roadmap features (perps, prediction, launchpad, NFT, and the whole RWA suite, which needs Casper’s compliant security tokens shipping later in 2026). You can still place and configure them to design your agent — they just don’t execute yet.\n\nTo run REAL transactions on testnet:\n1. Install the Casper Wallet extension, create a testnet account.\n2. Get free test CSPR from the faucet (testnet.cspr.live → Tools → Faucet).\n3. Connect your wallet (top bar) and set a CSPR.cloud key in Settings → Casper.\n4. Turn on Settings → Casper → “Execute real transactions”.\n5. Build an agent with a Live action (Send CSPR / Stake / Call contract) and real addresses, then Run once.\n6. Approve the wallet popup. The log shows the transaction hash and an explorer link.\n\nKeep Live execution on TESTNET while testing.',
        keywords: ['live', 'beta', 'soon', 'real', 'execution', 'testnet', 'transaction', 'sign', 'wallet', 'send cspr', 'stake', 'faucet', 'preview', 'coming soon'],
      },
      {
        id: 'wallet',
        title: 'Connect your Casper Wallet',
        body:
          'The "Connect wallet" button in the top bar links CasperFlow to the Casper Wallet browser extension (get it at casperwallet.io).\n\nOnce connected, the button shows your account and live balance (when a CSPR.cloud key is set), and your wallet automatically becomes the watched account for on-chain triggers if none was set. Click again to disconnect. Switching accounts in the extension is detected automatically.\n\nYour keys never leave the extension — CasperFlow only sees your public key. Transaction signing for real actions uses the wallet prompt (or a dedicated agent key in autonomous mode — see "Signing").',
        keywords: ['wallet', 'connect', 'casper wallet', 'extension', 'account', 'balance', 'public key'],
      },
      {
        id: 'casper-settings',
        title: 'Casper connection',
        body:
          'Settings → Casper: choose Testnet or Mainnet, enter a free CSPR.cloud API key (from console.cspr.cloud) and an account to watch. This unlocks real on-chain reads for the Balance change and Incoming transfer triggers. Test the connection to see the real balance.',
        keywords: ['casper', 'testnet', 'mainnet', 'cspr.cloud', 'api key', 'account', 'on-chain'],
      },
      {
        id: 'logs',
        title: 'Logs & debugging',
        body:
          'Settings → Logs is the diagnostic center:\n\n- Agent memory: shows every persisted variable (from "Set variable" actions with memory) and its current value, with a Clear memory button. Memory is cleared automatically when you switch workspace.\n- Debug log: a technical journal of what happens under the hood — connection failures (Casper, Telegram, Discord, AI), workspace operations, agent start/stop. When something doesn’t work, look here first; "Copy logs" copies everything for sharing.',
        keywords: ['logs', 'debug', 'debugging', 'memory', 'diagnostic', 'error', 'troubleshoot', 'copy'],
      },
      {
        id: 'alerts-settings',
        title: 'Alert connections',
        body:
          'Settings → Alerts: connect Telegram (bot token + chat ID) and Discord (webhook URL), each with a Test button. Credentials are stored only in your browser, never on a server.',
        keywords: ['alerts', 'telegram', 'discord', 'connect', 'token', 'webhook', 'test'],
      },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: 'link',
    articles: [
      {
        id: 'mcp-server',
        title: 'Casper MCP server (use CasperFlow actions from any AI agent)',
        body:
          'CasperFlow ships a standalone Model Context Protocol (MCP) server that exposes its REAL Casper actions to any MCP-compatible agent — nanobot, Claude, Claude Code, Cursor, and others. Instead of rebuilding CasperFlow on top of another framework, you let the wider agent ecosystem drive Casper through your actions.\n\nThe server lives in the "mcp-server" folder of the project and exposes these tools:\n\n- casper_account_info — the agent wallet’s public key, network and live balance.\n- casper_get_balance — live CSPR balance of any public key.\n- casper_resolve_name — resolve a CSPR.name (e.g. alice.cspr) to its account hash.\n- casper_send_cspr — sign + submit a real native transfer (to a public key, an account hash, or a resolved CSPR.name).\n- casper_delegate — sign + submit a real delegation (stake) to a validator.\n- casper_attest — build an EIP-712 attestation and anchor it on-chain, returning the claim hash and explorer link.\n\nSetup: cd mcp-server, npm install, npm run build. Then point your MCP client at dist/index.js and pass environment variables: CASPER_NETWORK (testnet/mainnet), CSPR_CLOUD_KEY (for reads), CASPER_SECRET_KEY_HEX (for signing — TESTNET ONLY), and optional CASPER_KEY_ALGO. See mcp-server/README.md for a ready-to-paste client config.\n\nWith this, an agent can be told "send 2.5 CSPR to alice.cspr and attest the payment" and it will call the tools directly. The same real signing path the CasperFlow canvas uses now works for the whole agent ecosystem — interoperability without giving up CasperFlow’s visual, deterministic, auditable core.\n\nSecurity: the server signs locally with the key you provide. Use a dedicated testnet key — never one holding mainnet funds.',
        keywords: ['mcp', 'model context protocol', 'nanobot', 'claude', 'cursor', 'integration', 'interoperability', 'server', 'tools', 'agent', 'api', 'ecosystem'],
      },
    ],
  },
]

export function searchWiki(query: string): WikiSection[] {
  const q = query.trim().toLowerCase()
  if (!q) return WIKI
  return WIKI.map((s) => ({
    ...s,
    articles: s.articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        a.keywords.some((k) => k.includes(q)),
    ),
  })).filter((s) => s.articles.length > 0)
}
