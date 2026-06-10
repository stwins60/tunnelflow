'use client'

import { useEffect, useState } from 'react'
import {
  Users, UserPlus, Trash2, Shield, Eye, Edit3,
  Copy, Check, Loader2, ChevronDown, ChevronUp,
  Plus, X, Mail
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────────

type AccessLevel = 'ADMIN' | 'EDITOR' | 'VIEWER'

interface GroupMembership { id: string; name: string; groupAccessLevel: string; memberAccessLevel: string | null }
interface User { id: string; email: string; accessLevel: AccessLevel; workspaceOwnerId: string | null; createdAt: string; groups: GroupMembership[] }
interface GroupMember { id: string; email: string; accessLevel: AccessLevel; memberAccessLevel: string | null }
interface Group { id: string; name: string; description: string | null; accessLevel: AccessLevel; createdAt: string; members: GroupMember[] }
interface Invitation { id: string; email: string; accessLevel: AccessLevel; expiresAt: string; acceptedAt: string | null; inviterEmail: string; createdAt: string }

const LEVEL_COLORS: Record<AccessLevel, string> = {
  ADMIN:  'bg-purple-100 text-purple-700',
  EDITOR: 'bg-blue-100 text-blue-700',
  VIEWER: 'bg-gray-100 text-gray-600',
}
const LEVEL_ICON: Record<AccessLevel, React.ReactNode> = {
  ADMIN:  <Shield className="w-3 h-3" />,
  EDITOR: <Edit3 className="w-3 h-3" />,
  VIEWER: <Eye className="w-3 h-3" />,
}

function AccessBadge({ level }: { level: AccessLevel }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[level]}`}>
      {LEVEL_ICON[level]}{level}
    </span>
  )
}

// ─── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ groups, onClose, onCreated }: { groups: Group[]; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail]           = useState('')
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('VIEWER')
  const [groupId, setGroupId]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [inviteUrl, setInviteUrl]   = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)

  async function send() {
    if (!email.trim()) { toast.error('Email is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/users/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), accessLevel, groupId: groupId || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send invite')
      const url = `${window.location.origin}${json.data.inviteUrl}`
      setInviteUrl(url)
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error sending invite')
    } finally {
      setSaving(false)
    }
  }

  function copy() {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Invite a user</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        {inviteUrl ? (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">Invite link generated. Share this with <strong>{email}</strong>:</p>
            <div className="flex gap-2">
              <input readOnly value={inviteUrl} className="flex-1 px-3 py-2 border rounded-lg text-xs font-mono text-gray-600 bg-gray-50 truncate" />
              <button onClick={copy} className="flex-shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400">Link expires in 7 days.</p>
            <button onClick={onClose} className="w-full py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Done</button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access level</label>
              <div className="grid grid-cols-3 gap-2">
                {(['VIEWER', 'EDITOR', 'ADMIN'] as AccessLevel[]).map(l => (
                  <button
                    key={l}
                    onClick={() => setAccessLevel(l)}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${accessLevel === l ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                {accessLevel === 'VIEWER' && 'Read-only access to tunnels, servers, and audit log.'}
                {accessLevel === 'EDITOR' && 'Can create and manage tunnels and servers. Cannot change CF settings.'}
                {accessLevel === 'ADMIN' && 'Full access including CF settings and user management.'}
              </p>
            </div>

            {groups.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Add to group <span className="text-gray-400 font-normal">(optional)</span></label>
                <select
                  value={groupId}
                  onChange={e => setGroupId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.accessLevel})</option>)}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={send} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <Mail className="w-4 h-4" />
                Generate invite link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Create group modal ────────────────────────────────────────────────────────

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('VIEWER')
  const [saving, setSaving]         = useState(false)

  async function create() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/users/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, accessLevel }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create group')
      toast.success('Group created')
      onCreated()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create group</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. DevOps Team" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this group is for" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Default access level for members</label>
            <div className="grid grid-cols-3 gap-2">
              {(['VIEWER', 'EDITOR', 'ADMIN'] as AccessLevel[]).map(l => (
                <button key={l} onClick={() => setAccessLevel(l)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${accessLevel === l ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={create} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Create group
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'members' | 'groups' | 'invitations'

export default function UsersPage() {
  const [tab, setTab]               = useState<Tab>('members')
  const [users, setUsers]           = useState<User[]>([])
  const [groups, setGroups]         = useState<Group[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading]       = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showGroup, setShowGroup]   = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const [u, g, i] = await Promise.all([
        fetch('/api/users').then(r => r.json()),
        fetch('/api/users/groups').then(r => r.json()),
        fetch('/api/users/invitations').then(r => r.json()),
      ])
      setUsers(u.data?.users ?? [])
      setGroups(g.data?.groups ?? [])
      setInvitations(i.data?.invitations ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function changeAccessLevel(userId: string, level: AccessLevel) {
    const res  = await fetch(`/api/users/${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessLevel: level }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to update'); return }
    toast.success('Access level updated')
    loadAll()
  }

  async function removeUser(userId: string, email: string) {
    if (!confirm(`Remove ${email} from the workspace?`)) return
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to remove user'); return }
    toast.success('User removed')
    loadAll()
  }

  async function deleteGroup(id: string, name: string) {
    if (!confirm(`Delete group "${name}"?`)) return
    const res = await fetch(`/api/users/groups/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete group'); return }
    toast.success('Group deleted')
    loadAll()
  }

  async function revokeInvite(id: string, email: string) {
    if (!confirm(`Revoke invite for ${email}?`)) return
    const res = await fetch(`/api/users/invitations/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to revoke invite'); return }
    toast.success('Invite revoked')
    loadAll()
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'members',     label: 'Members',     count: users.length },
    { id: 'groups',      label: 'Groups',      count: groups.length },
    { id: 'invitations', label: 'Invitations', count: invitations.filter(i => !i.acceptedAt).length },
  ]

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users & Access</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage who can access your workspace and what they can do.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowGroup(true)} className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Plus className="w-4 h-4" />New group
          </button>
          <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <UserPlus className="w-4 h-4" />Invite user
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${tab === t.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
      ) : (
        <>
          {/* Members tab */}
          {tab === 'members' && (
            <div className="space-y-2">
              {users.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No members yet.</p>}
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl bg-white">
                  <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                    {u.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {u.groups.map(g => (
                        <span key={g.id} className="text-xs text-gray-400">{g.name}</span>
                      ))}
                    </div>
                  </div>
                  {u.workspaceOwnerId === null ? (
                    <span className="text-xs text-gray-400 italic">Workspace owner</span>
                  ) : (
                    <select
                      value={u.accessLevel}
                      onChange={e => changeAccessLevel(u.id, e.target.value as AccessLevel)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="VIEWER">VIEWER</option>
                      <option value="EDITOR">EDITOR</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  )}
                  <AccessBadge level={u.accessLevel} />
                  {u.workspaceOwnerId !== null && (
                    <button onClick={() => removeUser(u.id, u.email)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Groups tab */}
          {tab === 'groups' && (
            <div className="space-y-3">
              {groups.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 font-medium">No groups yet</p>
                  <p className="text-xs text-gray-400 mt-1">Groups let you apply access levels to multiple users at once.</p>
                  <button onClick={() => setShowGroup(true)} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Create first group</button>
                </div>
              )}
              {groups.map(g => (
                <GroupCard key={g.id} group={g} users={users} onChanged={loadAll} onDelete={() => deleteGroup(g.id, g.name)} />
              ))}
            </div>
          )}

          {/* Invitations tab */}
          {tab === 'invitations' && (
            <div className="space-y-2">
              {invitations.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No invitations yet.</p>}
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl bg-white">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{inv.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {inv.acceptedAt ? (
                        <span className="text-green-600">Accepted</span>
                      ) : new Date(inv.expiresAt) < new Date() ? (
                        <span className="text-red-400">Expired</span>
                      ) : (
                        <>Expires {new Date(inv.expiresAt).toLocaleDateString()}</>
                      )}
                      {' · '}Invited by {inv.inviterEmail}
                    </p>
                  </div>
                  <AccessBadge level={inv.accessLevel} />
                  {!inv.acceptedAt && (
                    <button onClick={() => revokeInvite(inv.id, inv.email)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Revoke">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showInvite && <InviteModal groups={groups} onClose={() => setShowInvite(false)} onCreated={loadAll} />}
      {showGroup  && <CreateGroupModal onClose={() => setShowGroup(false)} onCreated={loadAll} />}
    </div>
  )
}

// ─── Group card with member management ────────────────────────────────────────

function GroupCard({ group, users, onChanged, onDelete }: { group: Group; users: User[]; onChanged: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding]     = useState(false)
  const [selectedUser, setSelectedUser] = useState('')

  const nonMembers = users.filter(u => u.workspaceOwnerId !== null && !group.members.some(m => m.id === u.id))

  async function addMember() {
    if (!selectedUser) return
    const res = await fetch(`/api/users/groups/${group.id}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedUser }),
    })
    if (!res.ok) { toast.error('Failed to add member'); return }
    toast.success('Member added')
    setSelectedUser('')
    setAdding(false)
    onChanged()
  }

  async function removeMember(userId: string) {
    const res = await fetch(`/api/users/groups/${group.id}/members`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) { toast.error('Failed to remove member'); return }
    onChanged()
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{group.name}</span>
            <AccessBadge level={group.accessLevel} />
          </div>
          {group.description && <p className="text-xs text-gray-400 mt-0.5">{group.description}</p>}
          <p className="text-xs text-gray-400 mt-0.5">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onDelete} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
        <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-2">
          {group.members.map(m => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{m.email}</span>
              <div className="flex items-center gap-2">
                {m.memberAccessLevel && <AccessBadge level={m.memberAccessLevel as AccessLevel} />}
                <button onClick={() => removeMember(m.id)} className="p-1 text-gray-300 hover:text-red-500 rounded"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}

          {adding ? (
            <div className="flex gap-2 mt-2">
              <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select a user…</option>
                {nonMembers.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
              <button onClick={addMember} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">Add</button>
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-white">Cancel</button>
            </div>
          ) : (
            nonMembers.length > 0 && (
              <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1">
                <Plus className="w-3.5 h-3.5" />Add member
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
