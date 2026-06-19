// Optional multi-provider AI "brain" for CasperFlow.
// Users bring their own API key. Calls run from the browser.
// Note: Claude (Anthropic) supports direct browser calls. OpenAI / Gemini / Grok
// typically require a backend proxy due to CORS — handled gracefully.

export type AiProvider = 'claude' | 'openai' | 'gemini' | 'grok' | 'custom'

export const AI_MODELS: Record<AiProvider, string[]> = {
  claude: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-pro'],
  grok: ['grok-3-mini', 'grok-3'],
  custom: [],
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  gemini: 'Gemini (Google)',
  grok: 'Grok (xAI)',
  custom: 'Custom (OpenAI-compatible)',
}

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

const SYSTEM =
  'You are the decision engine of an autonomous on-chain agent. ' +
  'Given a question and live context, answer with a strict JSON object ' +
  '{"decision": true|false, "reason": "<one short sentence>"}. ' +
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
          system,
          messages: [{ role: 'user', content: user }],
        }),
      })
      if (!r.ok) {
        debugLog('ai', `Build/Explain failed: HTTP ${r.status}`)
        return null
      }
      const j = await r.json()
      return j?.content?.[0]?.text ?? null
    }
    // OpenAI-compatible (openai, grok, custom, gemini-as-openai not covered)
    const base =
      cfg.provider === 'openai'
        ? 'https://api.openai.com/v1'
        : cfg.provider === 'grok'
          ? 'https://api.x.ai/v1'
          : (cfg.baseUrl || '').replace(/\/+$/, '')
    if (!base) return null
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!r.ok) return null
    const j = await r.json()
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
    'Output JSON only, no prose.'
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
    'Keep it minimal (often just trigger + one action). Only include params you are confident about; defaults are fine otherwise. Output JSON only, no prose.'
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
      return parseVerdict(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
    }

    // OpenAI-compatible providers: Grok (xAI) and any Custom endpoint (AlterHQ, etc.)
    if (cfg.provider === 'grok' || cfg.provider === 'custom') {
      const base =
        cfg.provider === 'grok'
          ? 'https://api.x.ai/v1'
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
      return parseVerdict(j?.choices?.[0]?.message?.content ?? '')
    }
  } catch (e) {
    debugLog('ai', `${cfg.provider} call error: ${e instanceof Error ? e.message : 'network/CORS'}`)
    return null
  }
  return null
}
