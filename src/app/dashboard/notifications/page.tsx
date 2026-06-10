'use client'

import { useEffect, useState } from 'react'
import { Bell, Plus, Trash2, Send, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ALL_EVENTS, EVENT_LABELS } from '@/lib/notifications/types'
import type { NotificationEvent, NotificationChannel } from '@/lib/notifications/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChannelType = 'smtp' | 'slack' | 'discord' | 'telegram'

const CHANNEL_LABELS: Record<ChannelType, string> = {
  smtp:     'SMTP Email',
  slack:    'Slack',
  discord:  'Discord',
  telegram: 'Telegram',
}

// ─── Empty config defaults ────────────────────────────────────────────────────

const DEFAULT_CONFIGS: Record<ChannelType, Record<string, unknown>> = {
  smtp:     { host: '', port: 587, secure: false, user: '', password: '', from: '', to: '' },
  slack:    { webhookUrl: '', channel: '', username: 'TunnelFlow' },
  discord:  { webhookUrl: '', username: 'TunnelFlow' },
  telegram: { botToken: '', chatId: '' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

// ─── Add Channel Modal ────────────────────────────────────────────────────────

function AddChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<'type' | 'config'>('type')
  const [type, setType] = useState<ChannelType>('slack')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>(DEFAULT_CONFIGS.slack)
  const [events, setEvents] = useState<NotificationEvent[]>(['sync.drift_detected', 'sync.error'])
  const [saving, setSaving] = useState(false)

  function setField(k: string, v: unknown) {
    setConfig(prev => ({ ...prev, [k]: v }))
  }

  function selectType(t: ChannelType) {
    setType(t)
    setConfig(DEFAULT_CONFIGS[t])
  }

  function toggleEvent(e: NotificationEvent) {
    setEvents(prev =>
      prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]
    )
  }

  async function create() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/notifications/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: name.trim(), config, events, enabled: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create channel')
      toast.success('Channel created')
      onCreated()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error creating channel')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Notification Channel</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Channel type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Channel type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CHANNEL_LABELS) as ChannelType[]).map(t => (
                <button
                  key={t}
                  onClick={() => selectType(t)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    type === t
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}
                >
                  {CHANNEL_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`My ${CHANNEL_LABELS[type]}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Config fields */}
          <ConfigFields type={type} config={config} setField={setField} />

          {/* Events */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Trigger on events</label>
            <div className="space-y-1.5">
              {ALL_EVENTS.map(e => (
                <label key={e} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={events.includes(e)}
                    onChange={() => toggleEvent(e)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{EVENT_LABELS[e]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            onClick={create}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Create channel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Config field components per type ─────────────────────────────────────────

function ConfigFields({
  type,
  config,
  setField,
}: {
  type: ChannelType
  config: Record<string, unknown>
  setField: (k: string, v: unknown) => void
}) {
  const inp = (key: string, label: string, opts?: { type?: string; placeholder?: string }) => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={opts?.type ?? 'text'}
        value={String(config[key] ?? '')}
        onChange={e => setField(key, opts?.type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={opts?.placeholder ?? ''}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  switch (type) {
    case 'smtp':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">{inp('host', 'SMTP host', { placeholder: 'smtp.example.com' })}</div>
            <div>{inp('port', 'Port', { type: 'number', placeholder: '587' })}</div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(config.secure)}
              onChange={e => setField('secure', e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Use TLS/SSL</span>
          </label>
          {inp('user', 'Username', { placeholder: 'user@example.com' })}
          {inp('password', 'Password', { type: 'password' })}
          {inp('from', 'From address', { placeholder: 'alerts@example.com' })}
          {inp('to', 'To address', { placeholder: 'admin@example.com' })}
        </div>
      )
    case 'slack':
      return (
        <div className="space-y-3">
          {inp('webhookUrl', 'Incoming Webhook URL', { placeholder: 'https://hooks.slack.com/services/...' })}
          {inp('channel', 'Channel (optional)', { placeholder: '#alerts' })}
          {inp('username', 'Bot username (optional)', { placeholder: 'TunnelFlow' })}
        </div>
      )
    case 'discord':
      return (
        <div className="space-y-3">
          {inp('webhookUrl', 'Webhook URL', { placeholder: 'https://discord.com/api/webhooks/...' })}
          {inp('username', 'Bot username (optional)', { placeholder: 'TunnelFlow' })}
        </div>
      )
    case 'telegram':
      return (
        <div className="space-y-3">
          {inp('botToken', 'Bot token', { placeholder: '123456:ABC-...' })}
          {inp('chatId', 'Chat ID', { placeholder: '-100123456789' })}
        </div>
      )
  }
}

// ─── Channel card ─────────────────────────────────────────────────────────────

function ChannelCard({
  channel,
  onDeleted,
  onUpdated,
}: {
  channel: NotificationChannel
  onDeleted: () => void
  onUpdated: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function test() {
    setTesting(true)
    try {
      const res = await fetch(`/api/notifications/channels/${channel.id}/test`, { method: 'POST' })
      const json = await res.json()
      if (json.data?.sent) {
        toast.success('Test notification sent successfully')
      } else {
        toast.error(`Test failed: ${json.data?.error ?? 'Unknown error'}`)
      }
      onUpdated()
    } catch {
      toast.error('Failed to send test')
    } finally {
      setTesting(false)
    }
  }

  async function toggleEnabled() {
    setToggling(true)
    try {
      await fetch(`/api/notifications/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !channel.enabled }),
      })
      onUpdated()
    } finally {
      setToggling(false)
    }
  }

  async function deleteChannel() {
    if (!confirm(`Delete "${channel.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/notifications/channels/${channel.id}`, { method: 'DELETE' })
      toast.success('Channel deleted')
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        {/* Enabled toggle */}
        <button
          onClick={toggleEnabled}
          disabled={toggling}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
            channel.enabled ? 'bg-blue-600' : 'bg-gray-200'
          }`}
          aria-label="Toggle enabled"
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
              channel.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{channel.name}</span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{CHANNEL_LABELS[channel.type as ChannelType]}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-400">{channel.events.length} events</span>
            {channel.lastError ? (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <XCircle className="w-3 h-3" /> Error: {channel.lastError.slice(0, 60)}
              </span>
            ) : channel.lastTestedAt ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="w-3 h-3" /> Tested {formatDate(channel.lastTestedAt)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={test}
            disabled={testing}
            className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            title="Send test notification"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
          <button
            onClick={deleteChannel}
            disabled={deleting}
            className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            title="Delete channel"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 mb-2">Subscribed events</p>
          <div className="flex flex-wrap gap-1.5">
            {channel.events.length === 0
              ? <span className="text-xs text-gray-400 italic">No events selected</span>
              : channel.events.map(e => (
                  <span key={e} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {EVENT_LABELS[e as NotificationEvent]}
                  </span>
                ))
            }
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400">
            <span>Last tested: {formatDate(channel.lastTestedAt)}</span>
            <span>Last error: {channel.lastError ? formatDate(channel.lastErrorAt) : 'None'}</span>
            <span>Created: {formatDate(channel.createdAt)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications/channels')
      const json = await res.json()
      setChannels(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Get alerted via email, Slack, Discord, or Telegram when tunnels drift or errors occur.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add channel
        </button>
      </div>

      {/* Channel list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading channels…
        </div>
      ) : channels.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No notification channels yet</p>
          <p className="text-gray-400 text-sm mt-1">Add a channel to get alerted when things go wrong.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Add your first channel
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map(ch => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              onDeleted={load}
              onUpdated={load}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddChannelModal
          onClose={() => setShowAdd(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}
