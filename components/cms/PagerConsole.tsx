"use client"

// Pager console — three panels:
//   Send:   pick a target (one teammate or everyone), type, page. Urgent
//           (default) = ntfy priority 5: phones alarm through DND.
//   Team:   roster = ntfy user accounts. Adding a member provisions their
//           account + read ACLs and generates the login password, shown ONCE with
//           step-by-step phone setup. Removing revokes everything.
//   History: last 72h of pages with per-member ACK status. Urgent pages
//           repeat every ~90s until the recipient taps ACK (max 8, 15 min).

import { useState } from "react"
import { useRouter } from "next/navigation"

export interface PagerMemberDisplay {
  id: string
  topic: string
}

export interface PageRow {
  id: string
  time: string // ISO
  message: string
  sentBy: string
  urgent: boolean
  targets: { memberId: string; ackedAt: string | null; repeatCount: number }[]
}

const PAGER_URL = "https://page.subfrost.io"

const fallbackName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)

export function PagerConsole({
  members,
  nicknames,
  selfMemberId,
  lastAcks,
  history,
  canSend,
  canManage,
  adminConfigured,
  rosterError,
}: {
  members: PagerMemberDisplay[]
  nicknames: Record<string, string>
  selfMemberId: string | null
  lastAcks: Record<string, string>
  history: PageRow[]
  canSend: boolean
  canManage: boolean
  adminConfigured: boolean
  rosterError: string | null
}) {
  const displayName = (id: string) => nicknames[id] ?? fallbackName(id)
  return (
    <div className="max-w-3xl space-y-10">
      {!canSend && (
        <Banner tone="warn">
          Sending is not configured (NTFY_TOKEN missing) — create the publish token and the
          <code className="mx-1">ntfy-publish-token</code> secret per k8s/ntfy/README.md.
        </Banner>
      )}
      {rosterError && <Banner tone="warn">Could not load the roster from ntfy: {rosterError}</Banner>}

      <SendPanel members={members} displayName={displayName} disabled={!canSend} />
      <TeamPanel
        members={members}
        displayName={displayName}
        selfMemberId={selfMemberId}
        lastAcks={lastAcks}
        canManage={canManage}
        adminConfigured={adminConfigured}
      />
      <HistoryPanel history={history} displayName={displayName} />
    </div>
  )
}

/* ---------------------------------- Send ---------------------------------- */

function SendPanel({ members, displayName, disabled }: { members: PagerMemberDisplay[]; displayName: (id: string) => string; disabled: boolean }) {
  const router = useRouter()
  const [target, setTarget] = useState<string>("all")
  const [message, setMessage] = useState("")
  const [urgent, setUrgent] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function send() {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    setSentTo(null)
    try {
      const res = await fetch("/api/admin/pager", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, message: message.trim(), urgent }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setSentTo(target === "all" ? "everyone" : displayName(target))
      setMessage("")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Send a page</h2>
      <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap gap-2">
          <TargetChip label="🚨 Everyone" active={target === "all"} onClick={() => setTarget("all")} />
          {members.map((m) => (
            <TargetChip key={m.id} label={displayName(m.id)} active={target === m.id} onClick={() => setTarget(m.id)} />
          ))}
          {members.length === 0 && (
            <span className="self-center text-sm text-white/40">No teammates yet — add them below.</span>
          )}
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
          }}
          rows={3}
          maxLength={1024}
          placeholder="What's the emergency?"
          className="w-full rounded border border-white/15 bg-black/30 p-3 text-sm text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            Urgent — alarms through DND and repeats every ~90s until ACKed
          </label>
          <button
            onClick={send}
            disabled={disabled || sending || !message.trim()}
            className="rounded bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Paging…" : target === "all" ? "Page everyone" : `Page ${displayName(target)}`}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {sentTo && <p className="text-sm text-green-400">Page sent to {sentTo}.</p>}
      </div>
    </section>
  )
}

/* ---------------------------------- Team ---------------------------------- */

interface NewMember {
  id: string
  topic: string
  password: string
}

interface DeviceCreds {
  memberId: string
  username: string
  password: string
  topic: string
}

function TeamPanel({
  members,
  displayName,
  selfMemberId,
  lastAcks,
  canManage,
  adminConfigured,
}: {
  members: PagerMemberDisplay[]
  displayName: (id: string) => string
  selfMemberId: string | null
  lastAcks: Record<string, string>
  canManage: boolean
  adminConfigured: boolean
}) {
  const router = useRouter()
  const [newId, setNewId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<NewMember | null>(null)
  const [device, setDevice] = useState<DeviceCreds | null>(null)

  async function provisionDevice(id: string) {
    if (
      !confirm(
        `Issue pager-device credentials for ${displayName(id)}? If their Echo was already set up, this rotates the password and the old setup stops receiving.`,
      )
    )
      return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/pager/members/device", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setDevice({ memberId: id, ...(json as Omit<DeviceCreds, "memberId">) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function addMember() {
    const id = newId.trim().toLowerCase()
    if (!id || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/pager/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setCreated(json as NewMember)
      setNewId("")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function rename(id: string) {
    const nickname = prompt(`Display name for ${id} (visible to the whole team):`, displayName(id))
    if (!nickname?.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/pager/members/nickname", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, nickname: nickname.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(id: string) {
    if (!confirm(`Remove ${displayName(id)}? Their login stops working immediately.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/pager/members", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      if (created?.id === id) setCreated(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Team</h2>
      {!adminConfigured && (
        <Banner tone="warn">
          Roster management is not configured (NTFY_ADMIN_TOKEN missing) — see k8s/ntfy/README.md.
        </Banner>
      )}
      <div className="space-y-3">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
            <div>
              <span className="font-medium text-white">{displayName(m.id)}</span>
              {(canManage || m.id === selfMemberId) && (
                <button
                  onClick={() => rename(m.id)}
                  disabled={busy}
                  title="Change display name (visible to everyone)"
                  className="ml-1.5 text-xs text-white/40 hover:text-white"
                >
                  ✎
                </button>
              )}
              <span className="ml-3 font-mono text-xs text-white/40">
                {m.topic} + page-all
              </span>
              {/* last ACK = proof their device is set up and receiving */}
              {lastAcks[m.id] ? (
                <span className="ml-3 text-xs text-green-400">
                  ✓ last ack {new Date(lastAcks[m.id]).toLocaleString()}
                </span>
              ) : (
                <span className="ml-3 text-xs text-yellow-400/80">never acked — unverified</span>
              )}
            </div>
            {canManage && (
              <div className="flex gap-2">
                <button
                  onClick={() => provisionDevice(m.id)}
                  disabled={busy}
                  title="Issue credentials for their M5 Atom Echo pager"
                  className="rounded border border-white/15 px-3 py-1 text-xs text-white/60 hover:border-blue-400 hover:text-blue-300 disabled:opacity-40"
                >
                  📟 Device
                </button>
                <button
                  onClick={() => removeMember(m.id)}
                  disabled={busy}
                  className="rounded border border-white/15 px-3 py-1 text-xs text-white/60 hover:border-red-500 hover:text-red-400 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}

        {canManage && (
          <div className="flex gap-2">
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
              placeholder="new teammate id, e.g. alice"
              className="flex-1 rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
            />
            <button
              onClick={addMember}
              disabled={busy || !newId.trim()}
              className="rounded bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add teammate"}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {created && <OnboardingCard member={created} displayName={displayName} onDismiss={() => setCreated(null)} />}
      {device && <DeviceCard creds={device} displayName={displayName} onDismiss={() => setDevice(null)} />}
    </section>
  )
}

/* One-time onboarding card: shown right after creating a member. The password is
 * NOT stored anywhere — once dismissed it is gone (remove + re-add to reissue). */
function OnboardingCard({ member, displayName, onDismiss }: { member: NewMember; displayName: (id: string) => string; onDismiss: () => void }) {
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-green-600/60 bg-green-950/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-green-300">{displayName(member.id)} is set up — send them this</h3>
        <button onClick={onDismiss} className="text-xs text-white/50 hover:text-white">
          dismiss (password shown only once)
        </button>
      </div>
      <CopyField label="Server" value={PAGER_URL} />
      <CopyField label="Username" value={member.id} />
      <CopyField label="Password" value={member.password} />
      <ol className="list-decimal space-y-1 pl-5 text-sm text-white/80">
        <li>Install the <b>ntfy</b> app (Play Store / App Store).</li>
        <li>Settings → <b>Default server</b>: enter the server URL, log in with the username + password.</li>
        <li>Subscribe to <code className="text-green-300">{member.topic}</code> and <code className="text-green-300">page-all</code>.</li>
        <li>
          For each topic: set priority to <b>alarm / override Do&nbsp;Not&nbsp;Disturb</b> with a loud sound
          (Android: topic settings → notification priority; iOS gets high-priority push automatically).
        </li>
        <li>Android: exempt ntfy from battery optimization (app settings prompt).</li>
        <li>Come back here and send them a test page.</li>
      </ol>
    </div>
  )
}

/* One-time device card: shown after issuing hardware-pager credentials.
 * These get typed into the Echo's Wi-Fi setup portal — see firmware/atom-pager. */
function DeviceCard({ creds, displayName, onDismiss }: { creds: DeviceCreds; displayName: (id: string) => string; onDismiss: () => void }) {
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-blue-500/60 bg-blue-950/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-blue-300">📟 Pager device for {displayName(creds.memberId)}</h3>
        <button onClick={onDismiss} className="text-xs text-white/50 hover:text-white">
          dismiss (password shown only once)
        </button>
      </div>
      <CopyField label="Member id" value={creds.memberId} />
      <CopyField label="Device username" value={creds.username} />
      <CopyField label="Device password" value={creds.password} />
      <ol className="list-decimal space-y-1 pl-5 text-sm text-white/80">
        <li>Flash the Echo with the pager firmware if not done yet (<code>firmware/atom-pager/README.md</code>).</li>
        <li>Power the Echo. Its LED turns <b>purple</b>: it broadcasts a Wi-Fi network named <code className="text-blue-300">SUBFROST-PAGER</code>.</li>
        <li>Join that network from a phone/laptop; a setup page opens (or browse to <code>192.168.4.1</code>).</li>
        <li>Pick the office Wi-Fi + its password, and enter the <b>member id</b>, <b>device username</b> and <b>device password</b> above.</li>
        <li>Save — the LED goes dim blue when it's connected and listening. Send a test page; press the top button to ACK.</li>
      </ol>
    </div>
  )
}

/* --------------------------------- History -------------------------------- */

function HistoryPanel({ history, displayName }: { history: PageRow[]; displayName: (id: string) => string }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Last 72 hours</h2>
      {history.length === 0 ? (
        <p className="text-sm text-white/50">No pages sent recently.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((p) => (
            <li key={p.id} className="rounded border border-white/10 bg-white/5 p-3 text-sm">
              <div className="flex items-center justify-between text-white/60">
                <span>
                  {p.urgent && <span className="mr-2 text-red-400">■</span>}
                  {p.sentBy} → {p.targets.length === 1 ? displayName(p.targets[0].memberId) : `${p.targets.length} people`}
                </span>
                <span>{new Date(p.time).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-white">{p.message}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.targets.map((t) => (
                  <span
                    key={t.memberId}
                    title={t.ackedAt ? `acked ${new Date(t.ackedAt).toLocaleString()}` : `unacked (${t.repeatCount} repeats)`}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      t.ackedAt
                        ? "border-green-600/50 bg-green-950/40 text-green-300"
                        : "border-yellow-600/50 bg-yellow-950/30 text-yellow-300"
                    }`}
                  >
                    {t.ackedAt ? "✓" : "⏳"} {displayName(t.memberId)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---------------------------------- bits ---------------------------------- */

function TargetChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
        active
          ? "border-red-500 bg-red-600/20 text-white"
          : "border-white/15 text-white/60 hover:border-white/40 hover:text-white"
      }`}
    >
      {label}
    </button>
  )
}

function Banner({ tone, children }: { tone: "warn"; children: React.ReactNode }) {
  void tone
  return (
    <p className="mb-4 rounded border border-yellow-600 bg-yellow-950/40 p-3 text-sm text-yellow-300">{children}</p>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="mb-1 text-xs text-white/50">{label}</div>
      <div className="flex gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-black/40 px-3 py-2 text-sm text-white">{value}</code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
          className="rounded border border-white/15 px-3 text-xs text-white/70 hover:border-white/40 hover:text-white"
        >
          {copied ? "✓" : "copy"}
        </button>
      </div>
    </div>
  )
}
