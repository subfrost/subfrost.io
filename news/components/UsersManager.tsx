"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createUser, setUserRole, setUserActive, resetPassword } from "@/actions/users"

type Role = "ADMIN" | "EDITOR" | "AUTHOR"

export interface UserRow {
  id: string
  email: string
  name: string | null
  role: Role
  active: boolean
  articleCount: number
}

export function UsersManager({ users, meId }: { users: UserRow[]; meId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>("AUTHOR")

  function refresh() {
    router.refresh()
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createUser({ email, name, password, role })
      if (res.ok) {
        setEmail("")
        setName("")
        setPassword("")
        setRole("AUTHOR")
        refresh()
      } else setError(res.error)
    })
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={onCreate}
        className="grid gap-4 rounded-xl border border-zinc-800 bg-card/40 p-5 sm:grid-cols-2"
      >
        <div className="sm:col-span-2 text-sm font-medium text-zinc-300">Add user</div>
        <div className="space-y-1.5">
          <Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-name">Name</Label>
          <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-pass">Temporary password</Label>
          <Input id="u-pass" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-role">Role</Label>
          <select
            id="u-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 text-sm text-zinc-100"
          >
            <option value="AUTHOR">Author — write & submit drafts</option>
            <option value="EDITOR">Editor — publish & edit any article</option>
            <option value="ADMIN">Admin — full control</option>
          </select>
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            Create user
          </Button>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Articles</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === meId
              return (
                <tr key={u.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">
                    <div className="text-white">{u.name ?? u.email}</div>
                    <div className="text-xs text-zinc-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={isMe || pending}
                      onChange={(e) =>
                        startTransition(async () => {
                          await setUserRole(u.id, e.target.value as Role)
                          refresh()
                        })
                      }
                      className="rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-100 disabled:opacity-50"
                    >
                      <option value="AUTHOR">AUTHOR</option>
                      <option value="EDITOR">EDITOR</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{u.articleCount}</td>
                  <td className="px-4 py-3">
                    <span className={u.active ? "text-emerald-300" : "text-zinc-500"}>
                      {u.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isMe || pending}
                        onClick={() =>
                          startTransition(async () => {
                            await setUserActive(u.id, !u.active)
                            refresh()
                          })
                        }
                      >
                        {u.active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          const np = prompt(`New password for ${u.email} (min 8 chars):`)
                          if (!np) return
                          startTransition(async () => {
                            const res = await resetPassword(u.id, np)
                            if (!res.ok) alert(res.error)
                          })
                        }}
                      >
                        Reset password
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
