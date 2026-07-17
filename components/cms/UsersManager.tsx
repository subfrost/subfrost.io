"use client"

import { Fragment, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserPlus, Copy, Check, Pencil, MonitorSmartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { rolePrivileges, type Privilege, type Role } from "@/lib/cms/privileges"
import { resolveCode } from "@/lib/cms/iam/registry"
import { PrivilegePicker } from "@/components/cms/PrivilegePicker"
import { PersonaQuickPick } from "@/components/cms/PersonaQuickPick"
import { deviceLabel, relTime as sessRelTime, FingerprintBadge } from "@/components/cms/SessionsManager"
import {
  provisionUser,
  updateUser,
  resetPassword,
  deleteUser,
} from "@/actions/cms/users"
import {
  adminListUserSessions,
  adminRevokeUserSession,
  adminRevokeAllUserSessions,
  type AdminSessionView,
} from "@/actions/cms/sessions"

export interface UserRow {
  id: string
  email: string
  name: string | null
  role: Role
  active: boolean
  avatarUrl: string | null
  status: string | null
  privileges: Privilege[]
  lastSeenAt: string | null
  totpEnabled: boolean
  articleCount: number
}

function relTime(iso: string | null): string {
  if (!iso) return "never"
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Normalize stored grants (possibly legacy enum codes) to dotted, minus role defaults.
function extraGrants(role: Role, stored: string[]): string[] {
  const fromRole = new Set(rolePrivileges(role))
  return [...new Set(stored.flatMap(resolveCode))].filter((p) => !fromRole.has(p))
}

export function UsersManager({
  users, meId, myRole, myPrivileges, assignableRoles, canEdit, canCreate, canManageRoles, canManageSessions,
}: {
  users: UserRow[]
  meId: string
  myRole: Role
  myPrivileges: Privilege[]
  assignableRoles: Role[]
  canEdit: boolean
  canCreate: boolean
  canManageRoles: boolean
  canManageSessions: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editFor, setEditFor] = useState<UserRow | null>(null)
  const [resetFor, setResetFor] = useState<UserRow | null>(null)
  const [sessionsFor, setSessionsFor] = useState<UserRow | null>(null)

  const refresh = () => router.refresh()
  const grantable = myPrivileges // PrivilegePicker disables anything not in here

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{users.length} user{users.length === 1 ? "" : "s"}</p>
        {canCreate && (
          <Button size="sm" onClick={() => { setError(null); setAdding(true) }}>
            <UserPlus size={15} /> Add user
          </Button>
        )}
      </div>
      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm rtable">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Articles</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === meId
              const manageable = !isMe && assignableRoles.includes(u.role)
              return (
                <Fragment key={u.id}>
                  <tr className="border-t border-zinc-800">
                    <td data-label="User" className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.avatarUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                          : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">{(u.name ?? u.email)[0]?.toUpperCase()}</div>}
                        <div>
                          <div className="flex items-center gap-2 text-white">
                            {u.name ?? u.email}
                            {u.totpEnabled && <span title="2FA enabled" className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">2FA</span>}
                          </div>
                          <div className="text-xs text-zinc-500">{u.email}</div>
                          {u.status && <div className="text-xs italic text-zinc-600">“{u.status}”</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Role" className="px-4 py-3">
                      <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{u.role}</span>
                    </td>
                    <td data-label="Articles" className="px-4 py-3 text-zinc-400">{u.articleCount}</td>
                    <td data-label="Status" className="px-4 py-3">
                      <div className={u.active ? "text-emerald-300" : "text-zinc-500"}>{u.active ? "Active" : "Disabled"}</div>
                      <div className="text-xs text-zinc-500">seen {relTime(u.lastSeenAt)}</div>
                    </td>
                    <td data-fullwidth className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={!manageable || !canEdit || pending} onClick={() => { setError(null); setEditFor(u) }}>
                          <Pencil size={13} /> Edit
                        </Button>
                        {canManageSessions && (
                          <Button size="sm" variant="ghost" disabled={!manageable || pending} onClick={() => { setError(null); setSessionsFor(u) }}>
                            <MonitorSmartphone size={13} /> Sessions
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={!manageable || !canEdit || pending} onClick={() => { setError(null); setResetFor(u) }}>Reset password</Button>
                        <Button size="sm" variant="ghost" disabled={!manageable || !canEdit || pending} className="text-red-400 hover:text-red-300"
                          onClick={() => { if (confirm(`Delete ${u.email}? This cannot be undone.`)) startTransition(async () => { const r = await deleteUser(u.id); if (!r.ok) setError(r.error); refresh() }) }}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddUserModal assignableRoles={assignableRoles} grantable={grantable} canManageRoles={canManageRoles}
          onClose={() => { setAdding(false); refresh() }} />
      )}
      {editFor && (
        <EditUserModal user={editFor} assignableRoles={assignableRoles} grantable={grantable} canManageRoles={canManageRoles}
          onClose={() => setEditFor(null)} onSaved={() => { setEditFor(null); refresh() }} />
      )}
      {resetFor && (
        <ResetPasswordModal user={resetFor} pending={pending} onClose={() => setResetFor(null)}
          onSubmit={(pw) => startTransition(async () => { const r = await resetPassword(resetFor.id, pw); if (!r.ok) setError(r.error); else setResetFor(null) })} />
      )}
      {sessionsFor && (
        <UserSessionsModal user={sessionsFor} onClose={() => setSessionsFor(null)} />
      )}
    </div>
  )
}

function UserSessionsModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [rows, setRows] = useState<AdminSessionView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    adminListUserSessions(user.id).then((r) => {
      if (!alive) return
      if (r.ok) setRows(r.sessions)
      else setError(r.error)
    })
    return () => { alive = false }
  }, [user.id])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-lg space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><MonitorSmartphone size={16} /> Sessions — {user.email}</div>
          {rows && rows.length > 0 && (
            <Button size="sm" variant="ghost" disabled={pending}
              onClick={() => startTransition(async () => { const r = await adminRevokeAllUserSessions(user.id); if (r.ok) setRows([]); else setError(r.error) })}>
              Revoke all
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {rows === null && !error && <p className="text-sm text-zinc-500">Loading…</p>}
        {rows !== null && rows.length === 0 && !error && (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 px-4 py-8 text-center text-sm text-zinc-600">
            No active sessions.
          </div>
        )}
        {rows !== null && rows.length > 0 && (
          <ul className="divide-y divide-zinc-800">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                    {deviceLabel(s.userAgent)}
                    <FingerprintBadge fp={s.tlsFingerprint} />
                  </div>
                  <div className="text-xs text-zinc-500">{s.ip ?? "unknown IP"} · active {sessRelTime(s.lastSeenAt)}</div>
                </div>
                <Button size="sm" variant="ghost" disabled={pending} className="shrink-0 text-red-400 hover:text-red-300"
                  onClick={() => startTransition(async () => { const r = await adminRevokeUserSession(user.id, s.id); if (r.ok) setRows((p) => (p ?? []).filter((x) => x.id !== s.id)); else setError(r.error) })}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
      </div>
    </div>
  )
}

function AddUserModal({ assignableRoles, grantable, canManageRoles, onClose }: {
  assignableRoles: Role[]; grantable: Privilege[]; canManageRoles: boolean; onClose: () => void
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<Role>(assignableRoles[assignableRoles.length - 1] ?? "STAFF")
  const [privileges, setPrivileges] = useState<string[]>([])
  const [emailOnboarding, setEmailOnboarding] = useState(true)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ tempPassword: string; emailed: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    startTransition(async () => {
      const r = await provisionUser({ email, name, role, privileges, emailOnboarding })
      if (r.ok) setResult({ tempPassword: r.tempPassword, emailed: r.emailed })
      else setError(r.error)
    })
  }

  const cls = "bg-zinc-950 text-zinc-100 border-zinc-700"
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-lg space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-sm font-semibold text-white"><UserPlus size={16} /> Add a user</div>

        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-400">User created.{result.emailed ? " An onboarding email was sent." : ""}</p>
            <div>
              <Label className="text-xs text-zinc-400">Temporary password — share it securely</Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded-md bg-zinc-950 px-3 py-2 font-mono text-sm text-sky-300">{result.tempPassword}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(result.tempPassword); setCopied(true) }}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </Button>
              </div>
              {!result.emailed && emailOnboarding && <p className="mt-1 text-xs text-amber-400">Email wasn’t sent (Resend not configured) — share the password manually.</p>}
            </div>
            <div className="flex justify-end"><Button size="sm" onClick={onClose}>Done</Button></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label className="text-zinc-300">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={cls} /></div>
              <div className="space-y-1.5"><Label className="text-zinc-300">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className={cls} /></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Role</Label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100">
                {assignableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className="text-[11px] text-zinc-600">Roles are convenient bundles; add precise privileges below.</p>
            </div>
            {canManageRoles && (
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Privileges</Label>
                <PersonaQuickPick value={privileges} onChange={setPrivileges} grantable={grantable} />
                <PrivilegePicker value={privileges} onChange={setPrivileges} grantable={grantable} />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={emailOnboarding} onChange={(e) => setEmailOnboarding(e.target.checked)} />
              Email the user their onboarding link + temporary password
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button size="sm" type="submit" disabled={pending || !email}>Create user</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function EditUserModal({ user, assignableRoles, grantable, canManageRoles, onClose, onSaved }: {
  user: UserRow; assignableRoles: Role[]; grantable: Privilege[]; canManageRoles: boolean
  onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(user.name ?? "")
  const [role, setRole] = useState<Role>(user.role)
  const [active, setActive] = useState(user.active)
  const [privileges, setPrivileges] = useState<string[]>(extraGrants(user.role, user.privileges))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The actor can only set roles they may assign; keep the user's current role visible.
  const roleOptions = [...new Set([user.role, ...assignableRoles])]

  function save() {
    setError(null)
    startTransition(async () => {
      const input: Parameters<typeof updateUser>[1] = { name: name.trim() || null, active }
      if (canManageRoles) { input.role = role; input.privileges = privileges }
      const r = await updateUser(user.id, input)
      if (r.ok) onSaved()
      else setError(r.error)
    })
  }

  const cls = "bg-zinc-950 text-zinc-100 border-zinc-700"
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-lg space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-sm font-semibold text-white"><Pencil size={15} /> Edit {user.email}</div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-zinc-300">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className={cls} /></div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Role</Label>
            <select value={role} disabled={!canManageRoles} onChange={(e) => setRole(e.target.value as Role)}
              className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50">
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
          <span className="text-xs text-zinc-500">(disabling signs the user out)</span>
        </label>

        {canManageRoles ? (
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Privileges (beyond the {role} role bundle)</Label>
            <PersonaQuickPick value={privileges} onChange={setPrivileges} grantable={grantable} />
            <PrivilegePicker value={privileges} onChange={setPrivileges} grantable={grantable} />
          </div>
        ) : (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-500">
            Editing roles & privileges requires the <code className="text-zinc-300">iam.manage_roles</code> privilege.
          </p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending} onClick={save}>Save changes</Button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordModal({ user, pending, onClose, onSubmit }: {
  user: UserRow; pending: boolean; onClose: () => void; onSubmit: (pw: string) => void
}) {
  const [pw, setPw] = useState("")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium text-zinc-200">Reset password for {user.email}</div>
        <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (min 8)" minLength={8} className="bg-zinc-950 text-zinc-100 border-zinc-700" />
        <p className="text-xs text-zinc-500">This signs the user out of all sessions.</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || pw.length < 8} onClick={() => onSubmit(pw)}>Reset</Button>
        </div>
      </div>
    </div>
  )
}
