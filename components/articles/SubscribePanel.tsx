"use client"

import { FormEvent, useMemo, useState } from "react"
import { ArrowUp, Check } from "lucide-react"

interface SubscribePanelProps {
  locale: "en" | "zh"
  fullBleed?: boolean
  footer?: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SubscribePanel({ locale, fullBleed = false, footer = false }: SubscribePanelProps) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const hasEmail = email.trim().length > 0

  const copy = useMemo(
    () =>
      locale === "zh"
        ? {
            title: "订阅",
            subtitle: "每当发布新文章，我们会将关键更新直接发送到你的邮箱。",
            cta: "订阅更新",
            placeholder: "输入你的邮箱地址",
            success: "订阅成功。新文章发布时我们会通知你。",
            invalid: "请输入有效的邮箱地址。",
            error: "订阅失败，请稍后重试。",
          }
        : {
            title: "Subscribe",
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
      className={`relative overflow-hidden ${footer ? "" : "px-6 py-14 sm:px-8 sm:py-16"} ${fullBleed || footer ? "" : "rounded-[8px]"}`}
      style={{
        background: "var(--ed-canvas)",
      }}
    >
      <div className={`relative flex flex-col ${footer ? "" : "items-center text-center"} ${fullBleed ? "mx-auto max-w-[1180px]" : ""}`}>
        <h2 className={`font-display font-semibold leading-[1.08] ${footer ? "text-[18px]" : "text-[27px] sm:text-[34px]"}`} style={{ color: "var(--ed-ink)" }}>
          {copy.title}
        </h2>
        <p className={`font-reading mt-2 ${footer ? "max-w-[260px] text-[14px] leading-[1.5]" : "text-[16px] sm:text-[18px]"}`} style={{ color: "var(--ed-body)" }}>
          {copy.subtitle}
        </p>

        <form onSubmit={onSubmit} className={`flex w-full max-w-[390px] flex-col gap-3 sm:flex-row sm:items-center ${footer ? "mt-4" : "mx-auto mt-7"}`}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={copy.placeholder}
            autoComplete="email"
            className={`font-display w-full min-w-0 bg-transparent px-0 outline-none transition-opacity placeholder:text-black/35 focus:placeholder:text-black/25 ${footer ? "h-8 text-[14px] sm:w-[185px]" : "h-12 text-[16px] sm:w-[245px]"}`}
            style={{
              color: "var(--ed-ink)",
            }}
            disabled={state === "loading"}
          />
          <button
            type="submit"
            disabled={state === "loading"}
            aria-label={copy.cta}
            className={`font-display inline-flex shrink-0 items-center justify-center rounded-full px-0 font-semibold transition-[background-color,opacity,transform] duration-300 ease-out hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-90 ${state === "success" ? "scale-100" : ""} ${footer ? "h-8 w-8 text-[14px]" : "h-9 w-9 text-[14px]"}`}
            style={{
              background: state === "success" ? "#16a34a" : hasEmail ? "var(--ed-ink)" : "color-mix(in srgb, var(--ed-ink) 42%, transparent)",
              color: "var(--ed-canvas)",
            }}
          >
            {state === "loading" ? (
              "..."
            ) : state === "success" ? (
              <Check className="h-3.5 w-3.5 transition-transform duration-300 ease-out" strokeWidth={2.8} />
            ) : (
              <ArrowUp className="h-4 w-4 transition-transform duration-300 ease-out" strokeWidth={2.4} />
            )}
          </button>
        </form>

        {message && state !== "success" ? (
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
