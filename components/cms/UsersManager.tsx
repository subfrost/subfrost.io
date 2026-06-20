"use client"

import { Fragment, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ALL_PRIVILEGES,
  PRIVILEGE_LABELS,
  rolePrivileges,
  type Privilege,
  type Role,
} from "@/lib/cms/privileges"
import {
  createUser,
  setUserRole,
  setUserActive,
  setUserPrivileges,
  resetPassword,
  deleteUser,
} from "@/actions/cms/users"

export interface UserRow {
  id: string
  email: string
  name: string | null
  role: Role
  active: boolean
  avatarUrl: string | null
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

export function UsersManager({
  users,
  meId,
  myRole,
  myPrivileges,
  assignableRoles,
  canManageRoles,
}: {
  users: UserRow[]
  meId: string
  myRole: Role
  myPrivileges: Privilege[]
  assignableRoles: Role[]
  canManageRoles: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>(assignableRoles[0] ?? "AUTHOR")
  const [newGrants, setNewGrants] = useState<Privilege[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [resetFor, setResetFor] = useState<UserRow | null>(null)

  const refresh = () => router.refresh()
  // Privileges the actor is allowed to grant.
  const grantable = ALL_PRIVILEGES.filter((p) => myPrivileges.includes(p))

  function onCreate(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    startTransition(async () => {
      const res = await createUser({ email, name, password, role, privileges: newGrants })
      if (res.ok) { setEmail(""); setName(""); setPassword(""); setNewGrants([]); refresh() }
      else setError(res.error)
    })
  }

  const inputCls = "bg-zinc-900 text-zinc-100 border-zinc-700"
  const selectCls = "flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"

  return (
    <div className="space-y-8">
      <form onSubmit={onCreate} className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2 text-sm font-medium text-zinc-300">Add user</div>
        <div className="space-y-1.5"><Label className="text-zinc-300">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} /></div>
        <div className="space-y-1.5"><Label className="text-zinc-300">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <div className="space-y-1.5"><Label className="text-zinc-300">Temporary password</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={inputCls} /></div>
        <div className="space-y-1.5"><Label className="text-zinc-300">Role</Label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={selectCls}>
            {assignableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {canManageRoles && grantable.length > 0 && (
          <div className="sm:col-span-2 space-y-2">
            <Label className="text-zinc-300">Extra privileges (beyond role defaults)</Label>
            <PrivilegeChecklist
              role={role}
              grantable={grantable}
              value={newGrants}
              onChange={setNewGrants}
            />
          </div>
        )}
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={pending}>Create user</Button>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Articles</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === meId
              // The actor can manage this row only if they outrank the target.
              const manageable = !isMe && assignableRoles.includes(u.role)
              return (
                <Fragment key={u.id}>
                  <tr className="border-t border-zinc-800">
                    <td className="px-4 py-3">
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
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select value={u.role} disabled={!manageable || !canManageRoles || pending}
                        onChange={(e) => startTransition(async () => { const r = await setUserRole(u.id, e.target.value as Role); if (!r.ok) setError(r.error); refresh() })}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 disabled:opacity-50">
                        {/* show the current role plus any the actor may assign */}
                        {[...new Set([u.role, ...assignableRoles])].map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{u.articleCount}</td>
                    <td className="px-4 py-3">
                      <div className={u.active ? "text-emerald-300" : "text-zinc-500"}>{u.active ? "Active" : "Disabled"}</div>
                      <div className="text-xs text-zinc-500">seen {relTime(u.lastSeenAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canManageRoles && manageable && (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setExpanded(expanded === u.id ? null : u.id)}>
                            Privileges
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={!manageable || pending}
                          onClick={() => startTransition(async () => { const r = await setUserActive(u.id, !u.active); if (!r.ok) setError(r.error); refresh() })}>
                          {u.active ? "Disable" : "Enable"}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={!manageable || pending} onClick={() => { setError(null); setResetFor(u) }}>
                          Reset password
                        </Button>
                        <Button size="sm" variant="ghost" disabled={!manageable || pending}
                          className="text-red-400 hover:text-red-300"
                          onClick={() => { if (confirm(`Delete ${u.email}? This cannot be undone.`)) startTransition(async () => { const r = await deleteUser(u.id); if (!r.ok) setError(r.error); refresh() }) }}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expanded === u.id && canManageRoles && manageable && (
                    <tr className="border-t border-zinc-800/50 bg-zinc-900/30">
                      <td colSpan={5} className="px-4 py-4">
                        <PrivilegeEditor
                          role={u.role}
                          grantable={grantable}
                          initial={u.privileges}
                          pending={pending}
                          onSave={(grants) => startTransition(async () => { const r = await setUserPrivileges(u.id, grants); if (!r.ok) setError(r.error); else setExpanded(null); refresh() })}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {resetFor && (
        <ResetPasswordModal
          user={resetFor}
          pending={pending}
          onClose={() => setResetFor(null)}
          onSubmit={(pw) => startTransition(async () => { const r = await resetPassword(resetFor.id, pw); if (!r.ok) setError(r.error); else setResetFor(null) })}
        />
      )}
    </div>
  )
}

function PrivilegeChecklist({ role, grantable, value, onChange }: {
  role: Role; grantable: Privilege[]; value: Privilege[]; onChange: (v: Privilege[]) => void
}) {
  const fromRole = new Set(rolePrivileges(role))
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {ALL_PRIVILEGES.map((p) => {
        const inRole = fromRole.has(p)
        const allowed = grantable.includes(p)
        const checked = inRole || value.includes(p)
        return (
          <label key={p} className={`flex items-center gap-2 text-xs ${inRole || !allowed ? "text-zinc-500" : "text-zinc-300"}`}>
            <input type="checkbox" checked={checked} disabled={inRole || !allowed}
              onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))} />
            {PRIVILEGE_LABELS[p]}{inRole && <span className="text-[10px] text-zinc-600">(role)</span>}
          </label>
        )
      })}
    </div>
  )
}

function PrivilegeEditor({ role, grantable, initial, pending, onSave }: {
  role: Role; grantable: Privilege[]; initial: Privilege[]; pending: boolean; onSave: (g: Privilege[]) => void
}) {
  // Only the extra grants (not role defaults) are editable here.
  const fromRole = new Set(rolePrivileges(role))
  const [grants, setGrants] = useState<Privilege[]>(initial.filter((p) => !fromRole.has(p)))
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">Extra privileges</div>
      <PrivilegeChecklist role={role} grantable={grantable} value={grants} onChange={setGrants} />
      <Button size="sm" disabled={pending} onClick={() => onSave(grants)}>Save privileges</Button>
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
        <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (min 8)" minLength={8}
          className="bg-zinc-950 text-zinc-100 border-zinc-700" />
        <p className="text-xs text-zinc-500">This signs the user out of all sessions.</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || pw.length < 8} onClick={() => onSubmit(pw)}>Reset</Button>
        </div>
      </div>
    </div>
  )
}
