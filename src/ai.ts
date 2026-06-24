// Optional multi-provider AI "brain" for CasperFlow.
// Users bring their own API key. Calls run from the browser.
// Note: Claude (Anthropic) supports direct browser calls. OpenAI / Gemini / Grok
// typically require a backend proxy due to CORS — handled gracefully.

export type AiProvider = 'claude' | 'openai' | 'gemini' | 'grok' | 'groq' | 'custom'

export const AI_MODELS: Record<AiProvider, string[]> = {
  claude: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-pro'],
  grok: ['grok-3-mini', 'grok-3'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  custom: [],
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  gemini: 'Gemini (Google)',
  grok: 'Grok (xAI)',
  groq: 'Groq (Llama, free, supports tools)',
  custom: 'Custom (OpenAI-compatible)',
}

// Groq is OpenAI-compatible and free; its endpoint passes tool definitions through,
// so the Autonomous Agent works on it (unlike some proxies).
const GROQ_BASE = 'https://api.groq.com/openai/v1'

export interface AiConfig {
  provider: AiProvider
  apiKey: string
  model: string
  baseUrl?: string // for custom OpenAI-compatible providers (e.g. AlterHQ)
}

export interface AiVerdict {
  decision: boolean // true = proceed
  reason: string
  raw?: string
}

import { debugLog } from './runtime'
import { recordUsage } from './aiUsage'

// Count one API call + its token usage against the active config's daily counter.
function trackUsage(cfg: AiConfig, j: unknown) {
  const o = (j ?? {}) as {
    usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number }
    usageMetadata?: { totalTokenCount?: number }
  }
  let tokens = 0
  if (o.usage?.total_tokens != null) tokens = o.usage.total_tokens
  else if (o.usage) tokens = (o.usage.input_tokens ?? 0) + (o.usage.output_tokens ?? 0)
  else if (o.usageMetadata?.totalTokenCount != null) tokens = o.usageMetadata.totalTokenCount
  recordUsage({ provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey }, tokens)
}

const SYSTEM =
  'You are the decision gate of an autonomous on-chain agent. ' +
  'You are given a question and the live context the agent has already gathered this run ' +
  '(on-chain balances and the results of prior steps). ' +
  'This context is complete and authoritative — decide using ONLY these values. ' +
  'Do NOT ask for more information and do NOT assume data is missing: if a value appears in the context, treat it as a verified fact. ' +
  'If the context satisfies the condition in the question, decide true. ' +
  'Only decide false if the context clearly violates the condition or shows a real risk. ' +
  'Answer with a strict JSON object {"decision": true|false, "reason": "<one short sentence that cites the deciding value>"}. ' +
  'decision=true means the agent should proceed with its action.'

function parseVerdict(text: string): AiVerdict {
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) {
      const j = JSON.parse(m[0])
      return { decision: !!j.decision, reason: String(j.reason ?? ''), raw: text }
    }
  } catch {
    /* fall through */
  }
  const yes = /\b(yes|true|proceed|buy|sell|act)\b/i.test(text)
  return { decision: yes, reason: text.slice(0, 140), raw: text }
}

// Free-form text completion (used by Build-with-AI and Explain-run).
export async function askText(cfg: AiConfig, system: string, user: string): Promise<string | null> {
  if (!cfg.apiKey) return null
  try {
    if (cfg.provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 1200,
          temperature: 0,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      })
      if (!r.ok) {
        debugLog('ai', `Build/Explain failed: HTTP ${r.status}`)
        return null
      }
      const j = await r.json()
      trackUsage(cfg, j)
      return j?.content?.[0]?.text ?? null
    }
    // OpenAI-compatible (openai, grok, custom, gemini-as-openai not covered)
    const base =
      cfg.provider === 'openai'
        ? 'https://api.openai.com/v1'
        : cfg.provider === 'grok'
          ? 'https://api.x.ai/v1'
          : cfg.provider === 'groq'
            ? GROQ_BASE
            : (cfg.baseUrl || '').replace(/\/+$/, '')
    if (!base) return null
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!r.ok) return null
    const j = await r.json()
    trackUsage(cfg, j)
    return j?.choices?.[0]?.message?.content ?? null
  } catch (e) {
    debugLog('ai', `Text call error: ${e instanceof Error ? e.message : 'network/CORS'}`)
    return null
  }
}

export interface WorkflowSpec {
  type: string
  params?: Record<string, string | number>
}

// Shared guidance appended to both the build and edit prompts: maps loose,
// imperfect phrasing to the right modules + params, and pins the variable names
// so the model never invents ones the app can't resolve.
const BUILDER_GUIDE =
  '\n\nINTENT MAPPING (map loose/everyday wording to the right module):\n' +
  '- "pay / send / transfer CSPR to someone" → transfer\n' +
  '- "buy a signal / data / call a paid API / pay per request / x402" → x402\n' +
  '- "cap / limit spending / max budget / don\'t spend more than" → spendlimit\n' +
  '- "alert / ping / DM / text / message me / let me know / notify (on Telegram)" → notify\n' +
  '- "tell the team on Discord" → discord\n' +
  '- "ask the AI / decide / judge / is it safe" → ai\n' +
  '- "prove / attest / anchor / record the decision on-chain / tamper-proof" → attest\n' +
  '- "receipt / proof of payment" → receipt\n' +
  '- "stake / delegate" → stake; "swap / trade X for Y" → swap\n' +
  '- "every N seconds/minutes/hours/days" → schedule (Repeat every; "every day"/"daily" → interval 1, unit days); "in N seconds/minutes" → schedule (Once after); "when price drops/rises" → price; "when I receive a transfer" → incoming\n\n' +
  'VARIABLES: results are exposed as {{variables}} you may drop into text params (message, data, title, content). ' +
  'Use ONLY these exact names — NEVER invent new ones:\n' +
  '{{hash}} = last transaction / settlement hash · {{txurl}} = last explorer link / proof link · {{amount}} = last amount · ' +
  '{{txurls}} = ALL explorer links from a batch of sends (one per line) · {{txhashes}} = all the hashes · {{txlist}} = a readable list of every send (amount → recipient + link) · ' +
  '{{sentcount}} = number of sends · {{senttotal}} = total CSPR sent · ' +
  '{{price}} = live CSPR price · {{balance}} = wallet balance · {{from}} = sender · {{to}} = recipient · ' +
  '{{symbol}} = token symbol · {{ai}} = the AI decision or summary · {{aidecision}} = YES/NO · {{claimhash}} = attestation hash · ' +
  '{{time}} · {{date}} · {{x402amount}} · {{x402endpoint}}.\n' +
  'For a BATCH of payments, a "show me all the transactions / links" request → use {{txlist}} (or {{txurls}}), NOT {{hash}}/{{txurl}} (those are only the last one).\n' +
  'So "settlement hash" / "transaction hash" / "tx hash" ALL mean {{hash}}; "proof link" / "explorer link" mean {{txurl}}.\n\n' +
  'X402 RULE: leave the x402 params verifyContains and minLength EMPTY unless the user explicitly asks to check the response for a SPECIFIC word/phrase. Never guess a generic word like "success", "ok" or "true" — that would reject a valid response.\n' +
  'RECIPIENT RULE: a transfer\'s `to` may be a saved wallet NAME (e.g. "wallet 3") OR a public key — the app resolves names to keys automatically. So "send 4 CSPR to wallet 3" → {"type":"transfer","params":{"amount":4,"to":"wallet 3"}}. For several recipients, output one transfer step per recipient, in order.\n\n' +
  'EXAMPLES (loose input → correct JSON):\n' +
  'User: "ping me on telegram when cspr drops under 2 cents" → {"name":"CSPR drop alert","steps":[{"type":"price","params":{"mode":"goes below","threshold":0.02}},{"type":"notify","params":{"message":"CSPR dropped to ${{price}}"}}]}\n' +
  'User: "with wallet 3, buy a signal from my paid api and text me the proof link" → {"name":"Signal buyer","steps":[{"type":"wallet","params":{"walletName":"wallet 3"}},{"type":"x402","params":{}},{"type":"notify","params":{"message":"Signal bought · proof {{txurl}}"}}]}\n' +
  'User: "every hour, if the AI says it is safe, send 5 cspr to wallet 2 and anchor the decision on casper" → {"name":"Guarded payout","steps":[{"type":"schedule","params":{"repeat":"Repeat every","interval":1,"unit":"hours"}},{"type":"wallet","params":{"walletName":"wallet 2"}},{"type":"ai","params":{"instruction":"Is it safe to send the payout now?"}},{"type":"transfer","params":{"amount":5}},{"type":"attest","params":{"topic":"payout-decision","data":"AI verdict {{aidecision}}: {{ai}}"}}]}\n\n' +
  'AGENT RULE (run-time reasoning / per-item conditions): when the task needs a decision the app cannot pre-compute — checking EACH recipient\'s balance, "only pay those under N", "decide then act", "pick the cheapest" — emit a SINGLE `agent` step with the whole task written in plain English in its `goal` param, and set maxSteps to about 10 for multi-recipient or multi-step goals. Do NOT express per-recipient balance checks with `condition`/`transfer` steps: a `condition` only sees the SIGNING wallet\'s balance and stops the whole branch, so it cannot skip individual recipients. Put exactly one `wallet` step before the agent so it can sign.\n' +
  'User: "with wallet 3, check wallet 1, wallet 2 and wallet 5 and send 4 CSPR only to the ones holding less than 3000 CSPR, then message me who you paid with the proof links" → {"name":"Conditional payout","steps":[{"type":"wallet","params":{"walletName":"wallet 3"}},{"type":"agent","params":{"role":"Treasury operator","goal":"Check the balance of wallet 1, wallet 2 and wallet 5. Send 4 CSPR only to those holding less than 3000 CSPR; skip the others. Then message me a summary of who you paid, with the proof links.","maxSteps":10}}]}\n'

// Edit an existing workflow from a natural-language instruction (iOS-26 style refine).
// Receives the current flow as a compact description; returns the full updated steps.
export async function editWorkflow(
  cfg: AiConfig,
  currentFlow: string,
  instruction: string,
  catalog: string,
): Promise<{ steps: WorkflowSpec[]; note?: string } | null> {
  const system =
    'You edit an existing CasperFlow agent (a no-code automation on the Casper blockchain). ' +
    'You are given the CURRENT workflow and an instruction to change it. ' +
    'Return STRICT JSON: {"note":"one short sentence on what you changed","steps":[{"type":"<moduleType>","params":{...}}]}. ' +
    'The steps array is the COMPLETE new workflow (keep existing steps unless asked to remove them; add/insert/modify as instructed). ' +
    'TRIGGER RULE: only include a trigger (schedule, price, on-chain event, etc.) when the user specifies WHEN the agent runs — a recurring schedule ("every 5 min"), a delay ("in 2 min"), or an event ("when I receive a transfer", "when price drops"). ' +
    'If the user just describes a one-time action to run on demand (e.g. "send 18 CSPR then notify me"), do NOT add any trigger — start directly with the first action node. Never add a trigger the user did not ask for.\n' +
    'Use ONLY these module types:\n' +
    catalog +
    '\n\nTIMING: for a one-time action after a delay (e.g. "in 1 min 23 sec") use a single `schedule` with repeat="Once after" and interval+unit (83, seconds) — do NOT add a `delay` step. For recurring ("every 5 min") use repeat="Repeat every". Convert durations into interval+unit; never default to 5 minutes.\n' +
    'WALLET: if the workflow signs a transaction (send, stake, attest, swap, x402, etc.) include exactly ONE `wallet` step before those actions. If the user names a wallet (e.g. "use wallet 3"), set its params to {"walletName":"<the exact name they said>"}; the app binds the real saved wallet automatically — never invent keys, secrets or public addresses.\n' +
    'Only make the change the user asked for — do not add extra steps (notifications, delays, conditions) unless requested.\n' +
    BUILDER_GUIDE +
    '\nOutput JSON only, no prose.'
  const user = `CURRENT WORKFLOW:\n${currentFlow}\n\nINSTRUCTION:\n${instruction}`
  const text = await askText(cfg, system, user)
  if (!text) return null
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const j = JSON.parse(m[0])
    if (!Array.isArray(j.steps)) return null
    return { steps: j.steps, note: typeof j.note === 'string' ? j.note : undefined }
  } catch {
    return null
  }
}

// Ask the AI to assemble a workflow from a natural-language description.
export async function generateWorkflow(
  cfg: AiConfig,
  description: string,
  catalog: string,
): Promise<{ name: string; steps: WorkflowSpec[] } | null> {
  const system =
    'You are an assistant that designs automation workflows for CasperFlow, a no-code agent builder on the Casper blockchain. ' +
    'Given a user description, output STRICT JSON: {"name":"short agent name","steps":[{"type":"<moduleType>","params":{...}}]}. ' +
    'TRIGGER RULE: only include a trigger (schedule, price, on-chain event, etc.) when the user specifies WHEN the agent runs — a recurring schedule ("every 5 min"), a delay ("in 2 min"), or an event ("when I receive a transfer", "when price drops"). ' +
    'If the user just describes a one-time action to run on demand (e.g. "send 18 CSPR then notify me"), do NOT add any trigger — start directly with the first action node. Never add a trigger the user did not ask for.\n' +
    'Use ONLY these module types and their meaning:\n' +
    catalog +
    '\n\nTIMING RULES (important):\n' +
    '- For a ONE-TIME action after a delay (e.g. "in 1 minute 23 seconds", "after 30 seconds", "once in 2 min"), use a SINGLE `schedule` trigger with repeat="Once after" and the right interval+unit (1 min 23 s → interval 83, unit seconds). Do NOT add a separate `delay` step for this.\n' +
    '- For a RECURRING action (e.g. "every 5 minutes", "each hour"), use `schedule` with repeat="Repeat every" and the matching interval+unit.\n' +
    '- Only use the `delay` module when the user explicitly wants to wait BETWEEN two steps inside one run.\n' +
    '- Convert all durations into the correct interval+unit; never silently default to 5 minutes.\n\n' +
    'WALLET RULE: if the agent signs a transaction (send, stake, attest, swap, x402, etc.) include exactly ONE `wallet` step before those actions. If the user names a wallet (e.g. "use wallet 3"), set its params to {"walletName":"<the exact name they said>"}; the app binds the real saved wallet automatically — never invent keys, secrets or addresses.\n' +
    'STEP RULES: Add ONLY the steps the user actually asked for. Do not add notifications, delays, conditions or extra actions unless requested. ' +
    'Keep it minimal (often just trigger + one action). Only include params you are confident about; defaults are fine otherwise.' +
    BUILDER_GUIDE +
    '\nOutput JSON only, no prose.'
  const text = await askText(cfg, system, description)
  if (!text) return null
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const j = JSON.parse(m[0])
    if (!Array.isArray(j.steps)) return null
    return { name: typeof j.name === 'string' ? j.name : 'AI-built agent', steps: j.steps }
  } catch {
    return null
  }
}

// Fetch the list of available model ids from an OpenAI-compatible provider
// (Custom/AlterHQ, OpenAI, Grok). Returns null on failure → caller keeps manual entry.
export async function fetchModels(cfg: {
  provider: AiProvider
  apiKey: string
  baseUrl?: string
}): Promise<string[] | null> {
  if (!cfg.apiKey) return null
  let base: string
  if (cfg.provider === 'openai') base = 'https://api.openai.com/v1'
  else if (cfg.provider === 'grok') base = 'https://api.x.ai/v1'
  else if (cfg.provider === 'custom') base = (cfg.baseUrl || '').replace(/\/+$/, '')
  else return null // claude / gemini don't expose an OpenAI-style /models list
  if (!base) return null
  const url = /\/models$/.test(base) ? base : `${base}/models`
  try {
    const r = await fetch(url, { headers: { authorization: `Bearer ${cfg.apiKey}` } })
    if (!r.ok) {
      debugLog('ai', `Model list failed: HTTP ${r.status}`)
      return null
    }
    const j = await r.json()
    const raw: unknown[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []
    const ids = raw
      .map((m) => (typeof m === 'string' ? m : (m as { id?: string })?.id))
      .filter((x): x is string => !!x)
    return Array.from(new Set(ids)).sort()
  } catch (e) {
    debugLog('ai', `Model list error: ${e instanceof Error ? e.message : 'network/CORS'}`)
    return null
  }
}

// Returns null when no key / unsupported in-browser → caller falls back to simulation.
export async function askAi(
  cfg: AiConfig,
  question: string,
  context: string,
): Promise<AiVerdict | null> {
  if (!cfg.apiKey) return null
  const prompt = `Context: ${context}\n\nQuestion: ${question}`

  try {
    if (cfg.provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 200,
          system: SYSTEM,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (!r.ok) {
        debugLog('ai', `Claude call failed: HTTP ${r.status}`)
        return null
      }
      const j = await r.json()
      trackUsage(cfg, j)
      const text = j?.content?.[0]?.text ?? ''
      return parseVerdict(text)
    }

    if (cfg.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (!r.ok) return null
      const j = await r.json()
      trackUsage(cfg, j)
      return parseVerdict(j?.choices?.[0]?.message?.content ?? '')
    }

    if (cfg.provider === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${SYSTEM}\n\n${prompt}` }] }],
          }),
        },
      )
      if (!r.ok) return null
      const j = await r.json()
      trackUsage(cfg, j)
      return parseVerdict(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
    }

    // OpenAI-compatible providers: Grok (xAI), Groq, any Custom endpoint (AlterHQ…).
    if (cfg.provider === 'grok' || cfg.provider === 'groq' || cfg.provider === 'custom') {
      const base =
        cfg.provider === 'grok'
          ? 'https://api.x.ai/v1'
          : cfg.provider === 'groq'
            ? GROQ_BASE
            : (cfg.baseUrl || '').replace(/\/+$/, '')
      if (!base) return null
      const url = /\/(chat\/)?completions$/.test(base) ? base : `${base}/chat/completions`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (!r.ok) return null
      const j = await r.json()
      trackUsage(cfg, j)
      return parseVerdict(j?.choices?.[0]?.message?.content ?? '')
    }
  } catch (e) {
    debugLog('ai', `${cfg.provider} call error: ${e instanceof Error ? e.message : 'network/CORS'}`)
    return null
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Autonomous agent loop (tool use).
// The model is given a goal and a set of tools; it decides which tools to call,
// we execute them via `executeTool` (App.tsx wires this to the real Casper actions,
// under guardrails), feed the results back, and repeat until the model produces a
// final answer or we hit the step cap. This is what turns a single AI node into an
// autonomous agent. Providers: Claude (native tool use) and OpenAI-compatible
// (OpenAI, Grok, custom). Gemini tool-use is not wired yet.
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentToolSpec {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface AgentEvent {
  kind: 'thinking' | 'tool_call' | 'tool_result' | 'final' | 'error'
  text?: string
  tool?: string
  args?: Record<string, unknown>
  result?: string
}

export interface AgentRunOptions {
  system: string // the agent's role + guardrail instructions
  goal: string // the user's plain-English objective
  tools: AgentToolSpec[]
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>
  maxSteps?: number
  onEvent?: (e: AgentEvent) => void
  // Polled between LLM turns; when it returns true the loop stops cleanly so the
  // user's Stop button can abort a long or looping run.
  shouldStop?: () => boolean
}

export interface AgentResult {
  finalText: string
  steps: number
  stopped: 'done' | 'maxsteps' | 'error' | 'aborted'
}

const isOpenAiCompatible = (p: AiProvider) =>
  p === 'openai' || p === 'grok' || p === 'groq' || p === 'custom'

function openAiBase(cfg: AiConfig): string {
  if (cfg.provider === 'openai') return 'https://api.openai.com/v1'
  if (cfg.provider === 'grok') return 'https://api.x.ai/v1'
  if (cfg.provider === 'groq') return GROQ_BASE
  return (cfg.baseUrl || '').replace(/\/+$/, '')
}

export async function runAgent(cfg: AiConfig, opts: AgentRunOptions): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? 8
  const emit = (e: AgentEvent) => opts.onEvent?.(e)
  if (!cfg.apiKey) {
    emit({ kind: 'error', text: 'No AI key configured.' })
    return { finalText: '', steps: 0, stopped: 'error' }
  }
  try {
    if (cfg.provider === 'claude') return await runAgentClaude(cfg, opts, maxSteps, emit)
    if (isOpenAiCompatible(cfg.provider)) return await runAgentOpenAi(cfg, opts, maxSteps, emit)
    emit({
      kind: 'error',
      text: `Tool-using agents are not wired for ${cfg.provider} yet — use Claude or an OpenAI-compatible provider.`,
    })
    return { finalText: '', steps: 0, stopped: 'error' }
  } catch (e) {
    emit({ kind: 'error', text: e instanceof Error ? e.message : 'agent loop error (network/CORS)' })
    return { finalText: '', steps: 0, stopped: 'error' }
  }
}

// Capability probe: does the configured provider actually support tool calling?
// We send one trivial tool and check whether the model calls it. Used by
// Settings → Test AI to warn up-front (the Autonomous Agent needs tool calling).
export async function probeToolSupport(cfg: AiConfig): Promise<'yes' | 'no' | 'unknown'> {
  if (!cfg.apiKey) return 'unknown'
  const name = 'cf_ping'
  try {
    if (cfg.provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 80,
          tools: [{ name, description: 'A health-check tool. Call it.', input_schema: { type: 'object', properties: {} } }],
          tool_choice: { type: 'tool', name },
          messages: [{ role: 'user', content: 'Call the cf_ping tool.' }],
        }),
      })
      if (!r.ok) return 'unknown'
      const j = await r.json()
      const blocks: { type?: string }[] = Array.isArray(j?.content) ? j.content : []
      return blocks.some((b) => b.type === 'tool_use') ? 'yes' : 'no'
    }
    if (isOpenAiCompatible(cfg.provider)) {
      const base = openAiBase(cfg)
      if (!base) return 'unknown'
      const url = /\/(chat\/)?completions$/.test(base) ? base : `${base}/chat/completions`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 80,
          messages: [{ role: 'user', content: 'You must call the cf_ping tool now.' }],
          tools: [{ type: 'function', function: { name, description: 'A health-check tool. Call it.', parameters: { type: 'object', properties: {} } } }],
          tool_choice: 'auto',
        }),
      })
      if (!r.ok) return 'unknown'
      const j = await r.json()
      const tc = j?.choices?.[0]?.message?.tool_calls
      return Array.isArray(tc) && tc.length > 0 ? 'yes' : 'no'
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

type Block = { type: string; [k: string]: unknown }

// Claude (Anthropic) native tool use.
async function runAgentClaude(
  cfg: AiConfig,
  opts: AgentRunOptions,
  maxSteps: number,
  emit: (e: AgentEvent) => void,
): Promise<AgentResult> {
  const tools = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
  const messages: { role: 'user' | 'assistant'; content: string | Block[] }[] = [
    { role: 'user', content: opts.goal },
  ]
  let steps = 0
  while (steps < maxSteps) {
    if (opts.shouldStop?.()) {
      emit({ kind: 'final', text: 'Stopped by the user.' })
      return { finalText: 'Stopped by the user.', steps, stopped: 'aborted' }
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1500,
        temperature: 0,
        system: opts.system,
        tools,
        messages,
      }),
    })
    if (!r.ok) {
      emit({ kind: 'error', text: `Claude HTTP ${r.status}` })
      return { finalText: '', steps, stopped: 'error' }
    }
    const j = await r.json()
    trackUsage(cfg, j)
    const content: Block[] = Array.isArray(j?.content) ? j.content : []
    const textOut = content
      .filter((b) => b.type === 'text')
      .map((b) => String(b.text ?? ''))
      .join(' ')
      .trim()
    if (textOut) emit({ kind: 'thinking', text: textOut })
    const toolUses = content.filter((b) => b.type === 'tool_use')
    if (toolUses.length === 0) {
      if (!textOut) {
        emit({
          kind: 'error',
          text: `Claude returned no text and no tool call (stop_reason: ${j?.stop_reason ?? 'unknown'}).`,
        })
        return { finalText: '', steps, stopped: 'error' }
      }
      emit({ kind: 'final', text: textOut })
      return { finalText: textOut, steps, stopped: 'done' }
    }
    messages.push({ role: 'assistant', content })
    const results: Block[] = []
    for (const tu of toolUses) {
      const name = String(tu.name)
      const args = (tu.input ?? {}) as Record<string, unknown>
      emit({ kind: 'tool_call', tool: name, args })
      const out = await opts.executeTool(name, args)
      emit({ kind: 'tool_result', tool: name, result: out })
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out })
    }
    messages.push({ role: 'user', content: results })
    steps++
  }
  emit({ kind: 'final', text: 'Reached the step limit.' })
  return { finalText: 'Reached the step limit.', steps, stopped: 'maxsteps' }
}

// OpenAI-compatible function calling (OpenAI, Grok, custom).
async function runAgentOpenAi(
  cfg: AiConfig,
  opts: AgentRunOptions,
  maxSteps: number,
  emit: (e: AgentEvent) => void,
): Promise<AgentResult> {
  const base = openAiBase(cfg)
  if (!base) {
    emit({ kind: 'error', text: 'No base URL for this provider.' })
    return { finalText: '', steps: 0, stopped: 'error' }
  }
  const url = /\/(chat\/)?completions$/.test(base) ? base : `${base}/chat/completions`
  const tools = opts.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
  type Msg = { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string }
  const messages: Msg[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.goal },
  ]
  let steps = 0
  while (steps < maxSteps) {
    if (opts.shouldStop?.()) {
      emit({ kind: 'final', text: 'Stopped by the user.' })
      return { finalText: 'Stopped by the user.', steps, stopped: 'aborted' }
    }
    const body = JSON.stringify({ model: cfg.model, temperature: 0, messages, tools, tool_choice: 'auto' })
    // Free tiers (e.g. Groq) rate-limit with HTTP 429 when an agent makes many
    // calls in a burst. Retry a few times with backoff (honoring Retry-After)
    // before giving up, so a transient limit doesn't abort a run mid-way.
    let r: Response | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body,
      })
      if (r.status !== 429 && r.status < 500) break
      if (attempt < 3) {
        const ra = Number(r.headers.get('retry-after'))
        const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1200 * (attempt + 1)
        emit({ kind: 'thinking', text: `Rate limited (HTTP ${r.status}); retrying in ${Math.round(Math.min(8000, waitMs) / 1000)}s…` })
        await new Promise((res) => setTimeout(res, Math.min(8000, waitMs)))
      }
    }
    if (!r || !r.ok) {
      emit({ kind: 'error', text: `${cfg.provider} HTTP ${r?.status ?? 'network'}` })
      return { finalText: '', steps, stopped: 'error' }
    }
    const j = await r.json()
    trackUsage(cfg, j)
    const choice = j?.choices?.[0]
    const msg = choice?.message
    if (!msg) {
      emit({ kind: 'error', text: `No choices in the response. Raw: ${JSON.stringify(j).slice(0, 200)}` })
      return { finalText: '', steps, stopped: 'error' }
    }
    const toolCalls: { id: string; function: { name: string; arguments: string } }[] = Array.isArray(
      msg.tool_calls,
    )
      ? msg.tool_calls
      : []
    // A capable model issues a few tool calls per turn. Dozens at once means a weak
    // model is looping instead of deciding; executing them all bloats the request
    // until the provider rejects it (HTTP 413). Stop early with clear guidance.
    if (toolCalls.length > 10) {
      emit({
        kind: 'error',
        text: `The model requested ${toolCalls.length} tool calls in a single step and is looping instead of deciding. Stopped before overloading the request. Use a stronger model for multi-step agents (Groq llama-3.3-70b-versatile, Claude, or OpenAI).`,
      })
      return { finalText: '', steps, stopped: 'error' }
    }
    if (msg.content) emit({ kind: 'thinking', text: String(msg.content) })
    if (toolCalls.length === 0) {
      const finalText = String(msg.content ?? '')
      if (!finalText) {
        emit({
          kind: 'error',
          text: `The model returned no text and called no tool (finish_reason: ${
            choice?.finish_reason ?? 'unknown'
          }). This provider/model likely does not support tool calling, which the agent needs. Try Claude or OpenAI gpt-4o.`,
        })
        return { finalText: '', steps, stopped: 'error' }
      }
      emit({ kind: 'final', text: finalText })
      return { finalText, steps, stopped: 'done' }
    }
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls })
    for (const tc of toolCalls) {
      const name = tc.function?.name
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function?.arguments || '{}')
      } catch {
        args = {}
      }
      emit({ kind: 'tool_call', tool: name, args })
      const out = await opts.executeTool(name, args)
      emit({ kind: 'tool_result', tool: name, result: out })
      messages.push({ role: 'tool', content: out, tool_call_id: tc.id })
    }
    steps++
  }
  emit({ kind: 'final', text: 'Reached the step limit.' })
  return { finalText: 'Reached the step limit.', steps, stopped: 'maxsteps' }
}
