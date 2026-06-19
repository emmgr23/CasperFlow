import { useEffect, useRef, useState } from 'react'
import { sendTelegram, sendDiscord, isDiscordWebhook } from './notify'
import { agentMemory, clearAgentMemory, getDebugLog, clearDebugLog, subscribeRuntime } from './runtime'
import { getAccountBalance, type CasperNet } from './casper'
import { setAgentKeyFromPem, generateAgentKey, getAgentPublicHex, hasAgentKey } from './tx'
import {
  loadWalletProfiles,
  upsertWalletProfile,
  deleteWalletProfile,
  updateWalletProfile,
  subscribeWallets,
  buildProfile,
  type WalletProfile,
  type WalletFormat,
} from './wallets'
import { askAi, fetchModels, AI_MODELS, PROVIDER_LABELS, type AiProvider } from './ai'
import Icon from './Icon'

export interface AiProfile {
  id: string
  name: string
  provider: AiProvider
  apiKey: string
  model: string
  baseUrl: string
  connected?: boolean
}

export interface Settings {
  scale: number
  minimap: boolean
  grid: boolean
  animated: boolean
  snap: boolean
  collide: boolean
  coloredEdges: boolean
  edgeStyle: 'dashed' | 'solid'
  help: boolean
  telegramToken: string
  telegramChatId: string
  discordWebhook: string
  casperNet: CasperNet
  csprCloudKey: string
  watchedAccount: string
  liveExecution: boolean
  defaultSigning: 'autonomous' | 'ask'
  agentKeyPem: string
  aiProvider: AiProvider
  aiKey: string
  aiModel: string
  aiBaseUrl: string
  aiProfiles: AiProfile[]
  activeProfileId: string
}

export const DEFAULT_SETTINGS: Settings = {
  scale: 1.15,
  minimap: true,
  grid: true,
  animated: true,
  snap: true,
  collide: true,
  coloredEdges: true,
  edgeStyle: 'dashed',
  help: true,
  telegramToken: '',
  telegramChatId: '',
  discordWebhook: '',
  casperNet: 'testnet',
  csprCloudKey: '',
  watchedAccount: '',
  liveExecution: false,
  defaultSigning: 'autonomous',
  agentKeyPem: '',
  aiProvider: 'claude',
  aiKey: '',
  aiModel: 'claude-haiku-4-5-20251001',
  aiBaseUrl: '',
  aiProfiles: [],
  activeProfileId: '',
}

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
  initialTab?: 'interface' | 'connections' | 'logs'
}

const TABS = [
  { id: 'interface', label: 'Interface', icon: 'gear' },
  { id: 'connections', label: 'Integrations', icon: 'link' },
  { id: 'logs', label: 'Logs', icon: 'file-code' },
] as const

type TabId = (typeof TABS)[number]['id']
type ConnId = '' | 'casper' | 'wallets' | 'ai' | 'telegram' | 'discord' | 'exchanges' | 'mcp' | 'csprtrade'

const MCP_CONFIG = `{
  "mcpServers": {
    "casperflow": {
      "command": "npx",
      "args": ["-y", "casperflow-mcp"],
      "env": {
        "CASPER_NETWORK": "testnet",
        "CSPR_CLOUD_KEY": "your-cspr-cloud-key",
        "CASPER_SECRET_KEY_HEX": "your-testnet-secret-key-hex"
      }
    }
  }
}`

const CSPRTRADE_CONFIG = `{
  "mcpServers": {
    "cspr-trade": {
      "url": "https://mcp.cspr.trade/mcp"
    }
  }
}`

// ── AES-256-GCM backup encryption (Web Crypto, no dependencies) ──
const PBKDF2_ITERS = 600_000
const b64encode = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf)
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(s)
}
const b64decode = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptPayload(plaintext: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(password, salt)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as unknown as BufferSource,
  )
  return { salt: b64encode(salt.buffer as ArrayBuffer), iv: b64encode(iv.buffer as ArrayBuffer), ct: b64encode(ct) }
}

async function decryptPayload(salt: string, iv: string, ct: string, password: string): Promise<string> {
  const key = await deriveAesKey(password, b64decode(salt))
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(iv) as unknown as BufferSource },
    key,
    b64decode(ct) as unknown as BufferSource,
  )
  return new TextDecoder().decode(pt)
}

export default function SettingsPanel({ settings, onChange, onClose, initialTab }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch })
  const [tab, setTab] = useState<TabId>(initialTab ?? 'interface')
  const [openConn, setOpenConn] = useState<ConnId>('casper')
  const [mcpCopied, setMcpCopied] = useState(false)
  const [wallets, setWallets] = useState<WalletProfile[]>(loadWalletProfiles())
  const [wName, setWName] = useState('')
  const [wFormat, setWFormat] = useState<WalletFormat>('pem')
  const [wSecret, setWSecret] = useState('')
  const [wStatus, setWStatus] = useState('')
  const [wBusy, setWBusy] = useState(false)
  const [wEditId, setWEditId] = useState('') // '' = adding; otherwise editing this id
  const [wFormOpen, setWFormOpen] = useState(false)

  // Keep the wallet list in sync with changes made on the canvas.
  useEffect(() => subscribeWallets(() => setWallets(loadWalletProfiles())), [])

  const resetWalletForm = () => {
    setWEditId('')
    setWName('')
    setWSecret('')
    setWFormat('pem')
    setWStatus('')
    setWFormOpen(false)
  }

  const startEditWallet = (p: WalletProfile) => {
    setWEditId(p.id)
    setWName(p.name)
    setWFormat(p.format)
    setWSecret(p.secret)
    setWStatus('')
    setWFormOpen(true)
  }

  const saveWallet = async () => {
    if (!wSecret.trim()) {
      setWStatus('Paste a key or recovery phrase first.')
      return
    }
    const existing = wallets.find((w) => w.id === wEditId)
    setWBusy(true)
    setWStatus(wFormat === 'seed' ? 'Deriving key from phrase…' : 'Loading key…')
    const r = await buildProfile({
      id: wEditId || undefined,
      name: wName.trim() || 'My wallet',
      format: wFormat,
      secret: wSecret,
      mode: existing?.mode ?? 'autonomous',
    })
    setWBusy(false)
    if (!r.ok || !r.profile) {
      setWStatus(r.error || 'Could not load this key.')
      return
    }
    setWallets(upsertWalletProfile(r.profile))
    setWStatus(
      `${wEditId ? 'Updated' : 'Saved'} ✓ ${r.profile.algo} · ${r.profile.publicHex.slice(0, 10)}…${r.profile.publicHex.slice(-4)}`,
    )
    setWEditId('')
    setWName('')
    setWSecret('')
    setWFormOpen(false)
  }

  const delWallet = (id: string) => {
    setWallets(deleteWalletProfile(id))
    if (wEditId === id) resetWalletForm()
  }

  // ── Full backup / restore (all CasperFlow data) ──
  const importRef = useRef<HTMLInputElement>(null)
  const [backupStatus, setBackupStatus] = useState('')

  const exportAll = async () => {
    const data: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('casperflow')) data[k] = localStorage.getItem(k) ?? ''
    }
    const payload = { app: 'casperflow', version: 1, exportedAt: new Date().toISOString(), data }
    const pwd = window.prompt(
      'Optional password to encrypt this backup with AES-256.\nLeave empty for an unencrypted file.\n\n(Your backup contains wallet keys and API keys — a strong password is recommended.)',
    )
    let fileObj: unknown = payload
    if (pwd && pwd.length) {
      setBackupStatus('Encrypting…')
      const { salt, iv, ct } = await encryptPayload(JSON.stringify(payload), pwd)
      fileObj = {
        app: 'casperflow',
        encrypted: true,
        cipher: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERS,
        salt,
        iv,
        ct,
      }
    }
    const blob = new Blob([JSON.stringify(fileObj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `casperflow-backup-${new Date().toISOString().slice(0, 10)}${pwd ? '-encrypted' : ''}.json`
    a.click()
    URL.revokeObjectURL(url)
    setBackupStatus(
      `Exported ${Object.keys(data).length} item(s)${pwd ? ' — encrypted 🔒' : ''}.`,
    )
  }

  const importAll = async (file: File) => {
    try {
      let payload = JSON.parse(await file.text())
      if (payload?.encrypted) {
        const pwd = window.prompt('This backup is encrypted. Enter its password:')
        if (!pwd) {
          setBackupStatus('Import cancelled.')
          return
        }
        setBackupStatus('Decrypting…')
        try {
          payload = JSON.parse(await decryptPayload(payload.salt, payload.iv, payload.ct, pwd))
        } catch {
          setBackupStatus('Wrong password or corrupted file.')
          return
        }
      }
      if (payload?.app !== 'casperflow' || !payload.data || typeof payload.data !== 'object') {
        setBackupStatus('Not a CasperFlow backup file.')
        return
      }
      let n = 0
      for (const [k, v] of Object.entries(payload.data as Record<string, string>)) {
        if (k.startsWith('casperflow')) {
          localStorage.setItem(k, String(v))
          n++
        }
      }
      setBackupStatus(`Restored ${n} item(s) — reloading…`)
      setTimeout(() => window.location.reload(), 700)
    } catch {
      setBackupStatus('Could not read this file.')
    }
  }

  const [tgStatus, setTgStatus] = useState('')
  const [dcStatus, setDcStatus] = useState('')
  const [csprStatus, setCsprStatus] = useState('')
  const [agentStatus, setAgentStatus] = useState(
    hasAgentKey() ? `Loaded — agent ${getAgentPublicHex()?.slice(0, 10)}…` : '',
  )

  const loadAgentKey = () => {
    const r = setAgentKeyFromPem(settings.agentKeyPem)
    if (!settings.agentKeyPem.trim()) {
      setAgentStatus('Cleared — transactions will use the wallet (popup).')
    } else if (r.ok && r.publicHex) {
      setAgentStatus(`Loaded ✓ — agent key ${r.publicHex.slice(0, 12)}… signs autonomously.`)
    } else {
      setAgentStatus(r.error || 'Failed to load key.')
    }
  }

  const genAgentKey = () => {
    const { pem, publicHex } = generateAgentKey()
    set({ agentKeyPem: pem })
    setAgentStatus(
      `New agent key created: ${publicHex.slice(0, 12)}… — fund it with test CSPR (faucet), then it runs autonomously.`,
    )
  }

  const clearAgentKey = () => {
    setAgentKeyFromPem('')
    set({ agentKeyPem: '' })
    setAgentStatus('Cleared — transactions will use the wallet (popup).')
  }

  const checkAgentBalance = async () => {
    const pk = getAgentPublicHex()
    if (!pk || !settings.csprCloudKey) {
      setAgentStatus('Load a key and set a CSPR.cloud key first.')
      return
    }
    setAgentStatus('Checking agent balance…')
    const info = await getAccountBalance(settings.casperNet, settings.csprCloudKey, pk)
    setAgentStatus(
      info
        ? `Agent ${pk.slice(0, 10)}… balance: ${info.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} CSPR`
        : `Agent ${pk.slice(0, 10)}… — balance 0 or not funded yet (use the faucet).`,
    )
  }
  const [aiStatus, setAiStatus] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [modelStatus, setModelStatus] = useState('')
  const [profileName, setProfileName] = useState('')
  const [, forceUpdate] = useState(0)

  const saveProfile = () => {
    const name = profileName.trim() || PROVIDER_LABELS[settings.aiProvider]
    const id = `p${Date.now()}`
    const prof: AiProfile = {
      id,
      name,
      provider: settings.aiProvider,
      apiKey: settings.aiKey,
      model: settings.aiModel,
      baseUrl: settings.aiBaseUrl,
      connected: aiStatus.startsWith('Connected'),
    }
    set({ aiProfiles: [...settings.aiProfiles, prof], activeProfileId: id })
    setProfileName('')
  }

  const activateProfile = (p: AiProfile) => {
    setModels([])
    setModelStatus('')
    setAiStatus('')
    set({
      activeProfileId: p.id,
      aiProvider: p.provider,
      aiKey: p.apiKey,
      aiModel: p.model,
      aiBaseUrl: p.baseUrl,
    })
  }

  const deleteProfile = (id: string) => {
    set({
      aiProfiles: settings.aiProfiles.filter((p) => p.id !== id),
      activeProfileId: settings.activeProfileId === id ? '' : settings.activeProfileId,
    })
  }

  const loadModels = async () => {
    setModelStatus('Loading models…')
    const list = await fetchModels({
      provider: settings.aiProvider,
      apiKey: settings.aiKey,
      baseUrl: settings.aiBaseUrl,
    })
    if (list && list.length) {
      setModels(list)
      setModelStatus(`Loaded ${list.length} models — pick one below`)
      if (!list.includes(settings.aiModel)) set({ aiModel: list[0] })
    } else {
      setModels([])
      setModelStatus('Could not load models — check Base URL & key, or type the name manually')
    }
  }

  const openaiCompatible =
    settings.aiProvider === 'custom' ||
    settings.aiProvider === 'openai' ||
    settings.aiProvider === 'grok'

  useEffect(() => subscribeRuntime(() => forceUpdate((n) => n + 1)), [])

  const copyLogs = () => {
    const text = getDebugLog()
      .map((e) => `[${e.t}] ${e.tag}: ${e.msg}`)
      .join('\n')
    navigator.clipboard?.writeText(text || 'No log entries.')
  }

  const testAi = async () => {
    setAiStatus('Asking the model…')
    const v = await askAi(
      {
        provider: settings.aiProvider,
        apiKey: settings.aiKey,
        model: settings.aiModel,
        baseUrl: settings.aiBaseUrl,
      },
      'Reply to confirm the connection works.',
      'This is a CasperFlow connection test.',
    )
    const ok = !!v
    setAiStatus(
      ok
        ? `Connected — model replied: "${(v!.reason || v!.raw || 'ok').slice(0, 80)}"`
        : 'No reply — key may be invalid, or this provider needs the backend (coming). Claude works in-browser.',
    )
    if (settings.activeProfileId) {
      set({
        aiProfiles: settings.aiProfiles.map((p) =>
          p.id === settings.activeProfileId ? { ...p, connected: ok } : p,
        ),
      })
    }
  }

  const testCsprCloud = async () => {
    setCsprStatus('Checking…')
    if (!settings.csprCloudKey || !settings.watchedAccount) {
      setCsprStatus('Enter an API key and an account to test')
      return
    }
    const info = await getAccountBalance(
      settings.casperNet,
      settings.csprCloudKey,
      settings.watchedAccount.trim(),
    )
    setCsprStatus(
      info
        ? `Connected — balance: ${info.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} CSPR`
        : 'Failed — check key, account, and network',
    )
  }

  const testTelegram = async () => {
    setTgStatus('Sending…')
    const ok =
      settings.telegramToken && settings.telegramChatId
        ? await sendTelegram(settings.telegramToken, settings.telegramChatId, 'CasperFlow connection test ✓')
        : false
    setTgStatus(ok ? 'Connected — test message sent!' : 'Failed — check token & chat ID')
  }

  const testDiscord = async () => {
    setDcStatus('Sending…')
    const ok = isDiscordWebhook(settings.discordWebhook)
      ? await sendDiscord(settings.discordWebhook, 'CasperFlow connection test ✓')
      : false
    setDcStatus(ok ? 'Connected — test message sent!' : 'Failed — check the webhook URL')
  }

  const check = (key: keyof Settings, label: string) => (
    <label className="settings-check">
      <input
        type="checkbox"
        checked={settings[key] as boolean}
        onChange={(e) => set({ [key]: e.target.checked })}
      />
      {label}
    </label>
  )

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-side">
          <div className="settings-side-head">
            <Icon name="gear" size={18} />
            <span>Settings</span>
          </div>
          <nav className="settings-side-nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`settings-side-tab${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} size={15} /> {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="settings-main">
          <button className="settings-x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
          <h2 className="settings-main-title">
            {TABS.find((t) => t.id === tab)?.label}
          </h2>

        {tab === 'connections' && (() => {
          const rows: { id: ConnId; icon: string; title: string; sub: string; on: boolean }[] = [
            { id: 'casper', icon: 'hexagon', title: 'Casper Network', sub: 'On-chain reads, live execution', on: !!settings.csprCloudKey },
            { id: 'wallets', icon: 'wallet', title: 'Wallets', sub: wallets.length ? `${wallets.length} saved wallet(s)` : 'Add signing wallets for your agents', on: wallets.length > 0 },
            { id: 'ai', icon: 'sparkles', title: 'AI Model', sub: settings.aiProfiles.length ? `${settings.aiProfiles.length} profile(s)` : 'Claude, GPT, Gemini, Grok, custom', on: !!settings.aiKey },
            { id: 'telegram', icon: 'message', title: 'Telegram', sub: 'Send alerts to your phone', on: !!(settings.telegramToken && settings.telegramChatId) },
            { id: 'discord', icon: 'broadcast', title: 'Discord', sub: 'Post to a channel via webhook', on: isDiscordWebhook(settings.discordWebhook) },
            { id: 'exchanges', icon: 'trending', title: 'Exchanges', sub: 'Gate · OKX · KuCoin — price feeds & arbitrage', on: false },
            { id: 'mcp', icon: 'broadcast', title: 'MCP server', sub: 'Let any AI agent (nanobot, Claude, Cursor…) drive Casper', on: false },
            { id: 'csprtrade', icon: 'repeat', title: 'CSPR.trade DEX', sub: 'Real swaps, quotes & liquidity via the official CSPR.trade MCP/SDK', on: false },
          ]
          return (
            <div className="conn-list">
              {rows.map((r) => (
                <div key={r.id} className={`conn-item${openConn === r.id ? ' open' : ''}`}>
                  <button className="conn-head" onClick={() => setOpenConn(openConn === r.id ? '' : r.id)}>
                    <span className="conn-icon"><Icon name={r.icon} size={18} /></span>
                    <span className="conn-meta">
                      <span className="conn-title">{r.title}</span>
                      <span className="conn-sub">{r.sub}</span>
                    </span>
                    <span className={`conn-status ${r.on ? 'on' : 'off'}`}>
                      <span className="conn-dot" /> {r.on ? 'Connected' : 'Not set'}
                    </span>
                    <Icon name="chevron" size={13} className="conn-chevron" style={{ transform: openConn === r.id ? 'rotate(90deg)' : 'rotate(0deg)' }} />
                  </button>
                </div>
              ))}
            </div>
          )
        })()}

        {tab === 'interface' && (
          <>
            <label className="settings-row">
              <span>Interface size</span>
              <span className="settings-value">{Math.round(settings.scale * 100)} %</span>
            </label>
            <input
              type="range"
              min={0.8}
              max={1.8}
              step={0.05}
              value={settings.scale}
              onChange={(e) => set({ scale: Number(e.target.value) })}
            />
            {check('minimap', 'Show minimap')}
            {check('grid', 'Show grid')}
            {check('animated', 'Animated connections')}
            {check('snap', 'Magnetic grid (snap)')}
            {check('collide', 'Prevent node overlap')}
            {check('coloredEdges', 'Colored connections')}
            {check('help', 'Help hints on hover (2s)')}

            <div className="settings-section">Connection style</div>
            <div className="settings-toggle">
              <button
                className={settings.edgeStyle !== 'solid' ? 'active' : ''}
                onClick={() => set({ edgeStyle: 'dashed' })}
              >
                Dashed
              </button>
              <button
                className={settings.edgeStyle === 'solid' ? 'active' : ''}
                onClick={() => set({ edgeStyle: 'solid' })}
              >
                Solid
              </button>
            </div>
            <div className="settings-note" style={{ marginTop: 8 }}>
              <b>Dashed</b> draws moving dashes along each wire (toggle the motion with “Animated
              connections”). <b>Solid</b> draws a clean, fully-filled line with no dashes.
            </div>

            <div className="settings-section">Backup &amp; restore</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-secondary settings-test" onClick={exportAll}>
                <Icon name="download" size={13} /> Export everything
              </button>
              <button
                className="btn-secondary settings-test"
                onClick={() => importRef.current?.click()}
              >
                <Icon name="upload" size={13} /> Import…
              </button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importAll(f)
                e.target.value = ''
              }}
            />
            {backupStatus && <div className="settings-status">{backupStatus}</div>}
            <div className="settings-note">
              Exports <b>everything</b> into one JSON file — saved wallets, connected APIs,
              Telegram/Discord, every agent on your canvas, and all preferences. Import it anytime
              (even on another computer) to restore your whole setup instantly.
            </div>
          </>
        )}

        {tab === 'connections' && openConn === 'casper' && (
          <>
            <div className="settings-section">Network</div>
            <div className="settings-toggle">
              <button
                className={settings.casperNet === 'testnet' ? 'active' : ''}
                onClick={() => set({ casperNet: 'testnet' })}
              >
                Testnet
              </button>
              <button
                className={settings.casperNet === 'mainnet' ? 'active' : ''}
                onClick={() => set({ casperNet: 'mainnet' })}
              >
                Mainnet
              </button>
            </div>

            <div className="settings-section">CSPR.cloud API</div>
            <div className="settings-field">
              <label>API key</label>
              <input
                type="password"
                placeholder="Free key from console.cspr.cloud"
                value={settings.csprCloudKey}
                onChange={(e) => set({ csprCloudKey: e.target.value })}
              />
            </div>
            <div className="settings-field">
              <label>Account to watch (public key)</label>
              <input
                type="text"
                placeholder="0202f5a9…"
                value={settings.watchedAccount}
                onChange={(e) => set({ watchedAccount: e.target.value })}
              />
            </div>
            <button className="btn-secondary settings-test" onClick={testCsprCloud}>
              Test connection
            </button>
            {csprStatus && <div className="settings-status">{csprStatus}</div>}
            <div className="settings-note">
              With a key + watched account, the “Balance change” and “Incoming transfer”
              triggers read real on-chain data. Get a free key at console.cspr.cloud.
            </div>

            <div className="settings-section">Live execution</div>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.liveExecution}
                onChange={(e) => set({ liveExecution: e.target.checked })}
              />
              Execute real transactions (“Send CSPR”)
            </label>
            <div className="settings-note">
              When ON and your wallet is connected, the “Send CSPR” action builds, signs (wallet
              popup) and submits a real {settings.casperNet} transaction. Keep this on TESTNET while
              testing — get free test CSPR from the faucet at testnet.cspr.live. All other actions
              remain preview/simulated for now.
            </div>

            <div className="settings-section">Default signing for new actions</div>
            <div className="settings-toggle">
              <button
                className={settings.defaultSigning === 'autonomous' ? 'active' : ''}
                onClick={() => set({ defaultSigning: 'autonomous' })}
              >
                Autonomous
              </button>
              <button
                className={settings.defaultSigning === 'ask' ? 'active' : ''}
                onClick={() => set({ defaultSigning: 'ask' })}
              >
                Ask approval
              </button>
            </div>
            <div className="settings-note">
              Sets the default for every new signable action you add. <b>Autonomous</b> = the agent
              runs the step without CasperFlow pausing for you; <b>Ask approval</b> = the branch
              pauses and waits. You can still override this per-card (flip a card → Signing).
              <br />
              <br />
              Note: with the Casper Wallet extension, every <i>real</i> transaction shows the
              wallet’s signing popup. For fully unattended signing (no popup), add a <b>Wallet</b>
              action to your agent (Logic → Wallet) and set it to <b>Autonomous</b> — each wallet
              keeps its own key and signing mode, with reusable profiles.
            </div>
          </>
        )}

        {tab === 'connections' && openConn === 'wallets' && (
          <>
            <div className="settings-section">Saved wallets</div>
            {wallets.length === 0 && !wFormOpen && (
              <div className="settings-note" style={{ marginTop: 0 }}>
                No wallets yet. Add one below — it becomes selectable in any Wallet action on the canvas.
              </div>
            )}
            <div className="wcard-list">
              {wallets.map((p) => (
                <div key={p.id} className={`wcard${wEditId === p.id ? ' editing' : ''}`}>
                  <div className="wcard-icon"><Icon name="wallet" size={18} /></div>
                  <div className="wcard-main">
                    <div className="wcard-name">{p.name}</div>
                    <div className="wcard-pk">
                      {p.publicHex.slice(0, 12)}…{p.publicHex.slice(-6)}
                    </div>
                    <div className="wcard-tags">
                      <span className="wcard-tag">{p.algo}</span>
                      <span className="wcard-tag">{p.format}</span>
                    </div>
                  </div>
                  <div className="wcard-mode">
                    <button
                      className={p.mode === 'autonomous' ? 'active' : ''}
                      onClick={() => setWallets(updateWalletProfile(p.id, { mode: 'autonomous' }))}
                      title="Default: sign autonomously (no popup)"
                    >
                      Auto
                    </button>
                    <button
                      className={p.mode === 'manual' ? 'active' : ''}
                      onClick={() => setWallets(updateWalletProfile(p.id, { mode: 'manual' }))}
                      title="Default: ask for approval before signing"
                    >
                      Ask
                    </button>
                  </div>
                  <button className="wcard-btn" title="Edit" onClick={() => startEditWallet(p)}>
                    <Icon name="edit" size={14} />
                  </button>
                  <button className="wcard-btn danger" title="Delete" onClick={() => delWallet(p.id)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>

            {!wFormOpen ? (
              <button
                className="btn-secondary settings-test"
                style={{ marginTop: 12 }}
                onClick={() => {
                  resetWalletForm()
                  setWFormOpen(true)
                }}
              >
                <Icon name="user-plus" size={13} /> Add a wallet
              </button>
            ) : (
              <div className="wform">
                <div className="wform-title">{wEditId ? 'Edit wallet' : 'Add a wallet'}</div>
                <div className="settings-field">
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Treasury"
                    value={wName}
                    onChange={(e) => setWName(e.target.value)}
                  />
                </div>
                <div className="settings-field">
                  <label>Type</label>
                  <select value={wFormat} onChange={(e) => setWFormat(e.target.value as WalletFormat)}>
                    <option value="pem">Secret key (PEM)</option>
                    <option value="hex">Secret key (hex)</option>
                    <option value="seed">Recovery phrase (12 / 24 words)</option>
                  </select>
                </div>
                <div className="settings-field">
                  <label>{wFormat === 'seed' ? 'Recovery phrase' : 'Secret key'}</label>
                  <textarea
                    className="agent-key-area"
                    rows={wFormat === 'seed' ? 3 : 4}
                    spellCheck={false}
                    placeholder={
                      wFormat === 'pem'
                        ? '-----BEGIN PRIVATE KEY-----\n…'
                        : wFormat === 'hex'
                          ? 'hex secret key'
                          : 'word1 word2 word3 … (12 or 24 words)'
                    }
                    value={wSecret}
                    onChange={(e) => setWSecret(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary settings-test" onClick={saveWallet} disabled={wBusy}>
                    {wBusy ? 'Working…' : wEditId ? 'Update wallet' : 'Save wallet'}
                  </button>
                  <button className="btn-secondary settings-test" onClick={resetWalletForm}>
                    Cancel
                  </button>
                </div>
                {wStatus && <div className="settings-status">{wStatus}</div>}
              </div>
            )}
            <div className="settings-note">
              Wallets appear in every <b>Wallet</b> action’s dropdown on the canvas. A recovery phrase
              is auto-matched to your real account (ed25519 or secp256k1). ⚠️ Testnet only — keys stay
              in your browser.
            </div>
          </>
        )}

        {tab === 'connections' && openConn === 'ai' && (
          <>
            {settings.aiProfiles.length > 0 && (
              <>
                <div className="settings-section">API profiles</div>
                <div className="ai-profiles">
                  {settings.aiProfiles.map((p) => {
                    const active = p.id === settings.activeProfileId
                    return (
                      <div
                        key={p.id}
                        className={`ai-profile${active ? ' active' : ''}`}
                        onClick={() => activateProfile(p)}
                      >
                        <div className="ai-profile-head">
                          <span className="ai-profile-name">{p.name}</span>
                          {p.connected && (
                            <span className="ai-profile-live">
                              <span className="ai-profile-dot" /> Connected
                            </span>
                          )}
                          {active && !p.connected && (
                            <span className="ai-profile-activetag">ACTIVE</span>
                          )}
                        </div>
                        <div className="ai-profile-sub">
                          <span className="ai-profile-model">
                            {PROVIDER_LABELS[p.provider]} · {p.model || '—'}
                          </span>
                          <button
                            type="button"
                            className="ai-profile-del"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteProfile(p.id)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <div className="settings-section">
              {settings.aiProfiles.length > 0 ? 'Edit / add configuration' : 'AI brain (optional)'}
            </div>
            <div className="settings-field">
              <label>Provider</label>
              <select
                value={settings.aiProvider}
                onChange={(e) => {
                  const p = e.target.value as AiProvider
                  setModels([])
                  setModelStatus('')
                  set({ aiProvider: p, aiModel: AI_MODELS[p][0] ?? '' })
                }}
              >
                {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            {settings.aiProvider === 'custom' && (
              <div className="settings-field">
                <label>Base URL</label>
                <input
                  type="text"
                  placeholder="https://api.alterhq.com/v1"
                  value={settings.aiBaseUrl}
                  onChange={(e) => set({ aiBaseUrl: e.target.value })}
                />
              </div>
            )}
            <div className="settings-field">
              <label>Model</label>
              {models.length > 0 ? (
                <select value={settings.aiModel} onChange={(e) => set({ aiModel: e.target.value })}>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : settings.aiProvider === 'custom' || AI_MODELS[settings.aiProvider].length === 0 ? (
                <input
                  type="text"
                  placeholder="model name (e.g. gpt-4o-mini)"
                  value={settings.aiModel}
                  onChange={(e) => set({ aiModel: e.target.value })}
                />
              ) : (
                <select value={settings.aiModel} onChange={(e) => set({ aiModel: e.target.value })}>
                  {AI_MODELS[settings.aiProvider].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              {openaiCompatible && (
                <button
                  type="button"
                  className="btn-secondary settings-test"
                  style={{ marginTop: 8 }}
                  onClick={loadModels}
                  disabled={
                    !settings.aiKey || (settings.aiProvider === 'custom' && !settings.aiBaseUrl)
                  }
                >
                  Load models from provider
                </button>
              )}
              {modelStatus && <div className="settings-status">{modelStatus}</div>}
            </div>
            <div className="settings-field">
              <label>API key</label>
              <input
                type="password"
                placeholder="Your own API key"
                value={settings.aiKey}
                onChange={(e) => set({ aiKey: e.target.value })}
              />
            </div>
            <button className="btn-secondary settings-test" onClick={testAi}>
              Test AI
            </button>
            {aiStatus && <div className="settings-status">{aiStatus}</div>}

            <div className="settings-section">Save as profile</div>
            <div className="ai-profile-save">
              <input
                type="text"
                placeholder="Profile name (e.g. AlterHQ GPT-4o)"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
              <button className="btn-primary settings-test" onClick={saveProfile}>
                Save profile
              </button>
            </div>
            <div className="settings-note">
              Save the current provider, key, base URL and model as a reusable profile, then switch
              between them in one click above. Run “Test AI” first so the saved profile shows a green
              Connected badge. Optional. Your keys stay in your browser.
            </div>
          </>
        )}

        {tab === 'logs' && (
          <>
            <div className="settings-section">Agent memory</div>
            {Object.keys(agentMemory).length === 0 ? (
              <div className="settings-note" style={{ marginTop: 0 }}>
                No persisted variables yet. “Set variable” actions with memory will appear here.
              </div>
            ) : (
              <div className="debug-memory">
                {Object.entries(agentMemory).map(([k, v]) => (
                  <div key={k} className="debug-memory-row">
                    <span className="debug-memory-key">{k}</span>
                    <span className="debug-memory-val">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              className="btn-secondary settings-test"
              style={{ marginTop: 8 }}
              onClick={() => clearAgentMemory()}
            >
              Clear memory
            </button>

            <div className="settings-section">Debug log</div>
            <div className="debug-log">
              {getDebugLog().length === 0 && (
                <div className="settings-note" style={{ marginTop: 0 }}>
                  Nothing logged yet. Connection failures, workspace operations and agent
                  lifecycle events will appear here.
                </div>
              )}
              {getDebugLog()
                .slice()
                .reverse()
                .map((e, i) => (
                  <div key={i} className="debug-line">
                    <span className="debug-time">{e.t}</span>
                    <span className={`debug-tag debug-tag-${e.tag}`}>{e.tag}</span>
                    <span className="debug-msg">{e.msg}</span>
                  </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-secondary settings-test" onClick={copyLogs}>
                Copy logs
              </button>
              <button className="btn-secondary settings-test" onClick={() => clearDebugLog()}>
                Clear
              </button>
            </div>
          </>
        )}

        {tab === 'connections' && openConn === 'telegram' && (
          <>
            <div className="settings-section">Telegram</div>
            <div className="settings-field">
              <label>Bot token</label>
              <input
                type="password"
                placeholder="123456:ABC-DEF…"
                value={settings.telegramToken}
                onChange={(e) => set({ telegramToken: e.target.value })}
              />
            </div>
            <div className="settings-field">
              <label>Chat ID</label>
              <input
                type="text"
                placeholder="e.g. 123456789"
                value={settings.telegramChatId}
                onChange={(e) => set({ telegramChatId: e.target.value })}
              />
            </div>
            <button className="btn-secondary settings-test" onClick={testTelegram}>
              Test Telegram
            </button>
            {tgStatus && <div className="settings-status">{tgStatus}</div>}
            <div className="settings-note">
              Create a bot with @BotFather, get your chat ID from @userinfobot. Credentials stay in
              your browser.
            </div>
          </>
        )}

        {tab === 'connections' && openConn === 'discord' && (
          <>
            <div className="settings-section">Discord</div>
            <div className="settings-field">
              <label>Webhook URL</label>
              <input
                type="password"
                placeholder="https://discord.com/api/webhooks/…"
                value={settings.discordWebhook}
                onChange={(e) => set({ discordWebhook: e.target.value })}
              />
            </div>
            <button className="btn-secondary settings-test" onClick={testDiscord}>
              Test Discord
            </button>
            {dcStatus && <div className="settings-status">{dcStatus}</div>}
            <div className="settings-note">
              Server Settings → Integrations → Webhooks → New webhook → copy the URL. Stored only in
              your browser.
            </div>
          </>
        )}

        {tab === 'connections' && openConn === 'exchanges' && (
          <>
            <div className="settings-section">Exchanges</div>
            <div className="coming-soon">
              <Icon name="rocket" size={26} />
              <div className="coming-soon-title">Coming soon</div>
              <div className="coming-soon-text">
                Connect Gate, OKX and KuCoin to track live CSPR prices across platforms, detect
                spreads, and build cross-exchange arbitrage agents. In the works.
              </div>
            </div>
          </>
        )}

        {tab === 'connections' && openConn === 'mcp' && (
          <>
            <div className="settings-section">MCP server (interoperability)</div>
            <p className="settings-hint">
              CasperFlow ships a standalone <b>Model Context Protocol</b> server so any MCP-compatible
              agent — nanobot, Claude, Claude&nbsp;Code, Cursor — can use your real Casper actions:
              read balances, resolve CSPR.names, send CSPR, delegate, and anchor EIP-712 attestations.
              Your visual agents stay as they are; this simply opens the same on-chain actions to the
              wider AI ecosystem.
            </p>
            <div className="settings-hint" style={{ marginTop: 6 }}>
              <b>One-time publish</b> (so agents can auto-fetch the server): from the{' '}
              <code className="wallet-addr">mcp-server</code> folder run{' '}
              <code className="wallet-addr">npm login &amp;&amp; npm publish</code>.
            </div>
            <div className="settings-hint" style={{ marginTop: 6 }}>
              After that, anyone just pastes this into their <b>agent's</b> MCP config (nanobot, Claude
              Desktop, Cursor). No install, no build — <code className="wallet-addr">npx</code> fetches
              and runs the server automatically:
            </div>
            <pre className="mcp-config">{MCP_CONFIG}</pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn-secondary settings-test"
                onClick={() => {
                  navigator.clipboard?.writeText(MCP_CONFIG)
                  setMcpCopied(true)
                  setTimeout(() => setMcpCopied(false), 1500)
                }}
              >
                <Icon name="copy" size={13} /> {mcpCopied ? 'Copied ✓' : 'Copy config'}
              </button>
            </div>
            <div className="wallet-warn" style={{ marginTop: 12 }}>
              ⚠️ The MCP server signs with the secret key you give it — use a <b>testnet</b> key only,
              never one holding real funds.
            </div>
          </>
        )}

        {tab === 'connections' && openConn === 'csprtrade' && (
          <>
            <div className="settings-section">CSPR.trade DEX</div>
            <p className="settings-hint">
              CasperFlow's <b>CSPR.trade swap</b> action executes real swaps through the official
              CSPR.trade SDK (build → sign locally with your Wallet → submit) — and the <b>Get swap
              quote</b> action reads live on-chain DEX rates for free. CSPR.trade also ships an
              official <b>MCP server</b>, so your AI agents can do DEX operations (market data, quotes,
              swaps, liquidity, portfolio) the same way they use CasperFlow's own MCP — a fully
              composable agentic-DeFi stack on Casper.
            </p>
            <div className="settings-hint" style={{ marginTop: 6 }}>
              <b>1.</b> Enable real swaps in this app:{' '}
              <code className="wallet-addr">npm install @make-software/cspr-trade-mcp-sdk</code>, then
              connect a Wallet before a Swap action and turn on real execution (testnet is free).
            </div>
            <div className="settings-hint" style={{ marginTop: 6 }}>
              <b>2.</b> Give your AI agent (nanobot, Claude, Cursor) the CSPR.trade MCP too — paste:
            </div>
            <pre className="mcp-config">{CSPRTRADE_CONFIG}</pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn-secondary settings-test"
                onClick={() => {
                  navigator.clipboard?.writeText(CSPRTRADE_CONFIG)
                  setMcpCopied(true)
                  setTimeout(() => setMcpCopied(false), 1500)
                }}
              >
                <Icon name="copy" size={13} /> {mcpCopied ? 'Copied ✓' : 'Copy config'}
              </button>
              <a className="btn-secondary settings-test" href="https://mcp.cspr.trade" target="_blank" rel="noreferrer">
                <Icon name="link" size={13} /> Docs
              </a>
            </div>
            <div className="wallet-warn" style={{ marginTop: 12 }}>
              ⚠️ CSPR.trade is non-custodial: keys stay local. Real swaps move real tokens — use
              <b> testnet</b> while building. This in-app swap is BETA (validated on first real run).
            </div>
          </>
        )}

        </div>
      </div>
    </div>
  )
}
