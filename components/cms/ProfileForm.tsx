"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateProfile } from "@/actions/cms/users"

export interface ProfileInitial {
  id: string
  email: string
  name: string
  bio: string
  twitter: string
  avatarUrl: string
}

export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [name, setName] = useState(initial.name)
  const [bio, setBio] = useState(initial.bio)
  const [twitter, setTwitter] = useState(initial.twitter)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    const fd = new FormData()
    fd.append("file", file); fd.append("kind", "avatar")
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd })
    const json = await res.json()
    setUploading(false)
    if (res.ok) setAvatarUrl(json.url)
    else setError(json.error || "Upload failed")
  }

  function save() {
    setError(null); setMsg(null)
    startTransition(async () => {
      const res = await updateProfile(initial.id, { name, bio, twitter, avatarUrl })
      if (res.ok) { setMsg("Saved"); router.refresh() } else setError(res.error)
    })
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 text-2xl text-zinc-400">
            {(name || initial.email)[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Change avatar"}
          </Button>
          <p className="mt-1 text-xs text-zinc-500">PNG/JPG/WebP, up to 8MB</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-zinc-300">Display name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 text-zinc-100 border-zinc-700" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-zinc-300">Bio</Label>
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="bg-zinc-900 text-zinc-100 border-zinc-700" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-zinc-300">X / Twitter handle</Label>
        <Input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@subfrost" className="bg-zinc-900 text-zinc-100 border-zinc-700" />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>Save profile</Button>
        {msg && <span className="text-sm text-emerald-400">{msg}</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  )
}
