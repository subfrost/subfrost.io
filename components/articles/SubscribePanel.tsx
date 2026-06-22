"use client"

import { FormEvent, useMemo, useState } from "react"

interface SubscribePanelProps {
  locale: "en" | "zh"
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SubscribePanel({ locale }: SubscribePanelProps) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const copy = useMemo(
    () =>
      locale === "zh"
        ? {
          title: "订阅 SUBFROST Updates",
            subtitle: "每当发布新文章，我们会将关键更新直接发送到你的邮箱。",
            cta: "订阅更新",
            placeholder: "输入你的邮箱地址",
            success: "订阅成功。新文章发布时我们会通知你。",
            invalid: "请输入有效的邮箱地址。",
            error: "订阅失败，请稍后重试。",
          }
        : {
          title: "Subscribe To SUBFROST Updates",
            subtitle: "Get notified when new research, releases, and field notes go live.",
            cta: "Subscribe",
            placeholder: "Enter your email address",
            success: "You are subscribed. We will notify you about new articles.",
            invalid: "Please enter a valid email address.",
            error: "Subscription failed. Please try again.",
          },
    [locale],
  )

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()

    if (!EMAIL_PATTERN.test(normalized)) {
      setState("error")
      setMessage(copy.invalid)
      return
    }

    setState("loading")
    setMessage("")

    try {
      const res = await fetch("/api/articles/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, locale, source: "articles_page" }),
      })

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || copy.error)
      }

      setEmail("")
      setState("success")
      setMessage(copy.success)
    } catch (err) {
      setState("error")
      setMessage(err instanceof Error ? err.message : copy.error)
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-[18px] border px-6 py-7 sm:px-8 sm:py-8"
      style={{
        borderColor: "var(--ed-hair)",
        background:
          "linear-gradient(145deg, color-mix(in srgb, var(--ed-accent) 16%, var(--ed-surface)) 0%, var(--ed-surface) 58%, color-mix(in srgb, var(--ed-ice) 14%, var(--ed-surface)) 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-2xl"
        style={{ background: "color-mix(in srgb, var(--ed-ice) 30%, transparent)" }}
      />
      <div className="relative">
        <p className="ed-eyebrow mb-2">SUBFROST Updates</p>
        <h2 className="font-display text-[27px] font-semibold leading-[1.08] sm:text-[34px]" style={{ color: "var(--ed-ink)" }}>
          {copy.title}
        </h2>
        <p className="font-reading mt-2 text-[16px] sm:text-[18px]" style={{ color: "var(--ed-body)" }}>
          {copy.subtitle}
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={copy.placeholder}
            autoComplete="email"
            className="font-reading h-12 w-full rounded-[12px] border px-4 text-[15px] outline-none transition-colors"
            style={{
              borderColor: "var(--ed-hair)",
              background: "var(--ed-canvas)",
              color: "var(--ed-ink)",
            }}
            disabled={state === "loading"}
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="font-display h-12 shrink-0 rounded-[12px] px-5 text-[14px] font-medium tracking-[0.3px] transition-opacity disabled:cursor-not-allowed disabled:opacity-70"
            style={{ background: "var(--ed-accent)", color: "white" }}
          >
            {state === "loading" ? "..." : copy.cta}
          </button>
        </form>

        {message ? (
          <p
            className="font-reading mt-3 text-[14px]"
            style={{ color: state === "success" ? "var(--ed-accent)" : "#c73c28" }}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  )
}
