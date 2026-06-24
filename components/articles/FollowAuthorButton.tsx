"use client"

import { FormEvent, useState } from "react"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FollowAuthorButton({
  authorId, authorName, locale,
}: { authorId: string; authorName: string; locale: "en" | "zh" }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle")

  const copy = locale === "zh"
    ? { follow: `关注 ${authorName}`, placeholder: "输入你的邮箱地址", confirm: "关注", done: "已关注", invalid: "请输入有效邮箱。", error: "失败，请重试。" }
    : { follow: `Follow ${authorName}`, placeholder: "Enter your email", confirm: "Follow", done: "Following", invalid: "Enter a valid email.", error: "Failed, try again." }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(normalized)) { setState("error"); return }
    setState("loading")
    try {
      const res = await fetch("/api/articles/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, authorId, locale }),
      })
      if (!res.ok) throw new Error("failed")
      setState("success")
    } catch {
      setState("error")
    }
  }

  if (state === "success") {
    return <span className="ed-follow-done text-[13px] font-medium" style={{ color: "var(--ed-body)" }}>✓ {copy.done}</span>
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="ed-follow-btn inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
        style={{ borderColor: "color-mix(in srgb, var(--ed-ink) 18%, transparent)", color: "var(--ed-ink)" }}>
        {copy.follow}
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="inline-flex items-center gap-2">
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={copy.placeholder}
        autoComplete="email" disabled={state === "loading"}
        className="ed-follow-input min-w-0 rounded-[6px] border bg-transparent px-2 py-1.5 text-[13px] outline-none"
        style={{ borderColor: state === "error" ? "#c73c28" : "color-mix(in srgb, var(--ed-ink) 18%, transparent)", color: "var(--ed-ink)" }} />
      <button type="submit" disabled={state === "loading"}
        className="rounded-[6px] px-3 py-1.5 text-[13px] font-semibold"
        style={{ background: "var(--ed-action-bg)", color: "var(--ed-action-fg)" }}>
        {state === "loading" ? "..." : copy.confirm}
      </button>
    </form>
  )
}
