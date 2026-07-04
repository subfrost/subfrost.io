"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateProfile } from "@/actions/cms/users"
import { uploadInlineImage } from "@/lib/cms/inline-image-upload"

export interface ProfileInitial {
  id: string
  email: string
  name: string
  bio: string
  twitter: string
  avatarUrl: string
  status: string
}

export function ProfileForm({ initial, canEditBio }: { initial: ProfileInitial; canEditBio: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [name, setName] = useState(initial.name)
  const [bio, setBio] = useState(initial.bio)
  const [twitter, setTwitter] = useState(initial.twitter)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  const [status, setStatus] = useState(initial.status)

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = "" // allow re-picking the same file after a failure
    setUploading(true); setUploadError(null)
    try {
      setAvatarUrl(await uploadInlineImage(file, fetch, "avatar"))
    } catch (err) {
      // Inline (next to the button), so a gateway HTML answer or network drop can
      // never strand the button on "Uploading…" with the error off-screen.
      const detail = err instanceof Error && err.message ? ` — ${err.message}` : ""
      setUploadError(`Upload failed${detail}`)
    } finally {
      setUploading(false)
    }
  }

  function save() {
    setError(null); setMsg(null)
    startTransition(async () => {
      // Status is self-service for everyone; public-byline fields require EDIT_BIO.
      const res = await updateProfile(
        initial.id,
        canEditBio ? { name, status, bio, twitter, avatarUrl } : { name, status },
      )
      if (res.ok) { setMsg("Saved"); router.refresh() } else setError(res.error)
    })
  }

  return (
    <div className="ed-admin-reveal max-w-2xl space-y-6">
      {canEditBio && (
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--ed-surface)] text-2xl text-[color:var(--ed-muted)]">
              {(name || initial.email)[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Change avatar"}
            </Button>
            <p className="mt-1 text-xs text-[color:var(--ed-muted)]">PNG/JPG/WebP, up to 8MB</p>
            {uploadError && <p role="alert" className="mt-1 text-xs text-[#b8321a]">{uploadError}</p>}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-[color:var(--ed-body)]">Display name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)]" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[color:var(--ed-body)]">Status</Label>
        <Input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={140} placeholder="What you're working on..." className="border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)]" />
      </div>
      {canEditBio ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-[color:var(--ed-body)]">Bio</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[color:var(--ed-body)]">X / Twitter handle</Label>
            <Input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@subfrost" className="border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)]" />
          </div>
        </>
      ) : (
        <p className="rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] p-3 text-xs text-[color:var(--ed-muted)]">
          A public author profile (bio, avatar, social handle) is available once you have editor privileges.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>Save profile</Button>
        {msg && <span className="text-sm text-[#1ea463]">{msg}</span>}
        {error && <span className="text-sm text-[#b8321a]">{error}</span>}
      </div>
    </div>
  )
}
