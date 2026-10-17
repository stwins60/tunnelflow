'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Bot,
  Sparkles,
  Send,
  Loader2,
  Activity,
  Shield,
  Globe,
  Network,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Cpu,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

interface ToolCall {
  name: string
  args: Record<string, any>
  result: any
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string
  model?: string
  toolCalls?: ToolCall[]
  suggestedActions?: string[]
  timestamp: string
}

interface AgentStatus {
  status: string
  provider: string
  capabilities: string[]
  systemSummary: {
    tunnels: number
    servers: number
    degradedServers: number
  }
  suggestedQuestions: string[]
}

export default function AiAgentPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchAgentStatus()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function fetchAgentStatus() {
    try {
      const res = await fetch('/api/ai-agent')
      const data = await res.json()
      if (data.ok) {
        setAgentStatus(data.data)
        // Add initial welcome message if messages list is empty
        if (messages.length === 0) {
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content: `### 👋 Welcome to TunnelFlow AI Infrastructure Agent\n\nI can autonomously audit your infrastructure, execute real-time health checks, troubleshoot failing upstreams, and verify Cloudflare Tunnel and DNS ingress rules.\n\nChoose a quick diagnostic below or ask me anything!`,
              provider: data.data.provider,
              model: 'tunnelflow-expert-v2',
              suggestedActions: data.data.suggestedQuestions,
              timestamp: new Date().toLocaleTimeString(),
            },
          ])
        }
      }
    } catch {
      // ignore
    } finally {
      setStatusLoading(false)
    }
  }

  async function sendMessage(textToSend?: string) {
    const text = (textToSend || input).trim()
    if (!text || loading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await res.json()
      if (data.ok) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.data.reply,
          provider: data.data.provider,
          model: data.data.model,
          toolCalls: data.data.toolCalls,
          suggestedActions: data.data.suggestedActions,
          timestamp: new Date().toLocaleTimeString(),
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        toast.error(data.error ?? 'Failed to get agent response')
      }
    } catch {
      toast.error('Network request failed')
    } finally {
      setLoading(false)
    }
  }

  function toggleTools(id: string) {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function copyMessage(id: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }

  function clearHistory() {
    setMessages([])
    fetchAgentStatus()
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header title="AI Infrastructure Agent" />

      <main className="flex flex-1 flex-col overflow-hidden p-4 sm:p-6">
        {/* Top Status & Metrics Bar */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Engine Status</p>
                <div className="flex items-center gap-1.5 font-medium text-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="capitalize">{agentStatus?.provider || 'Autonomous'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tunnels</p>
                <p className="font-semibold text-sm">{agentStatus?.systemSummary?.tunnels ?? 0} active</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Managed Servers</p>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{agentStatus?.systemSummary?.servers ?? 0} total</span>
                  {(agentStatus?.systemSummary?.degradedServers ?? 0) > 0 && (
                    <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-xs font-semibold text-rose-500">
                      {agentStatus?.systemSummary?.degradedServers} down
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Health Probe</p>
                  <p className="font-medium text-xs text-emerald-600 dark:text-emerald-400">Ready</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => sendMessage('Run live health check across all endpoints')}
                disabled={loading}
              >
                <Activity className="h-3.5 w-3.5 text-blue-500" />
                Probe
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Chat / Diagnostic Feed */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                    <Sparkles className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-xs ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'border border-border/60 bg-muted/30 text-foreground rounded-bl-xs'
                  }`}
                >
                  {/* Tool execution accordion (if any) */}
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mb-3 rounded-lg border border-border/50 bg-background/50 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleTools(m.id)}
                        className="flex w-full items-center justify-between px-3 py-2 text-muted-foreground hover:text-foreground font-mono"
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          <Terminal className="h-3.5 w-3.5 text-blue-500" />
                          Executed {m.toolCalls.length} tool probe(s)
                        </span>
                        {expandedTools[m.id] ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {expandedTools[m.id] && (
                        <div className="border-t border-border/50 p-2.5 space-y-2 bg-black/5 dark:bg-black/20 font-mono text-[11px] overflow-x-auto">
                          {m.toolCalls.map((t, idx) => (
                            <div key={idx} className="rounded border border-border/40 p-2 bg-background/60">
                              <span className="font-semibold text-blue-500">▶ {t.name}</span>
                              <pre className="mt-1 text-muted-foreground max-h-32 overflow-y-auto">
                                {JSON.stringify(t.result, null, 2)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message body with Markdown style */}
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words whitespace-pre-wrap leading-relaxed text-sm">
                    {m.content}
                  </div>

                  {/* Assistant Footer Info */}
                  {m.role === 'assistant' && (
                    <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <Bot className="h-3 w-3 text-blue-500" />
                          {m.model || 'expert-engine'}
                        </span>
                        <span>•</span>
                        <span>{m.timestamp}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyMessage(m.id, m.content)}
                        className="hover:text-foreground p-1"
                        title="Copy message"
                      >
                        {copiedId === m.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Suggested Follow-up Action Chips */}
                  {m.suggestedActions && m.suggestedActions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 pt-1">
                      {m.suggestedActions.map((action, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => sendMessage(action)}
                          className="rounded-full border border-blue-500/20 bg-blue-500/5 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-500/15 dark:text-blue-400 transition-colors"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {m.role === 'user' && (
                  <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-gray-800 text-white text-xs font-semibold">
                    You
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white animate-pulse">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span>Analyzing infrastructure & executing tool probes...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions & Input Bar */}
          <div className="border-t border-border/60 bg-background/80 p-3 sm:p-4 backdrop-blur-sm">
            {messages.length <= 1 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  '🔍 Diagnose all failing servers',
                  '🚇 Check Cloudflare tunnel status',
                  '🛡️ Audit security posture and API keys',
                  '🌐 Verify DNS routing records',
                ].map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendMessage(q)}
                    className="rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendMessage()
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask TunnelFlow Agent to diagnose, test, or inspect infrastructure..."
                disabled={loading}
                className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />

              <Button
                type="submit"
                disabled={loading || !input.trim()}
                className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-2 font-medium"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="hidden sm:inline">Send</span>
              </Button>

              {messages.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={clearHistory}
                  title="Clear conversation"
                  className="h-10 w-10 text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
