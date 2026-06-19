import { debugLog } from './runtime'

export async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    const j = await r.json()
    if (!j.ok) debugLog('telegram', `Send failed: ${j.description ?? 'unknown error'}`)
    return !!j.ok
  } catch (e) {
    debugLog('telegram', `Send error: ${e instanceof Error ? e.message : 'network'}`)
    return false
  }
}

export async function sendDiscord(webhookUrl: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })
    if (!r.ok) debugLog('discord', `Webhook failed: HTTP ${r.status}`)
    return r.ok
  } catch (e) {
    debugLog('discord', `Webhook error: ${e instanceof Error ? e.message : 'network'}`)
    return false
  }
}

export const isDiscordWebhook = (s: string) =>
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(s)
