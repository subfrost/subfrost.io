"use client"

import { FormEvent, useMemo, useState } from "react"
import { ArrowUp, Check } from "lucide-react"

interface SubscribePanelProps {
  locale: "en" | "zh"
  fullBleed?: boolean
  footer?: boolean
  compact?: boolean
  hideSubtitle?: boolean
  centered?: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SubscribePanel({ locale, fullBleed = false, footer = false, compact = false, hideSubtitle = false, centered = false }: SubscribePanelProps) {
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
            subtitle: "Get notified when new releases, updates, & articles go live!",
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
        background: footer || compact ? "transparent" : "var(--ed-canvas)",
      }}
    >
      <div
        className={`relative ${
          compact
            ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2"
            : `flex flex-col ${footer ? (centered ? "items-center text-center" : "") : "items-center text-center"}`
        } ${fullBleed ? "mx-auto max-w-[1180px]" : ""}`}
      >
        <h2 className={`font-display font-semibold leading-[1.08] ${compact ? "order-1" : ""} ${footer || compact ? "text-[18px]" : "text-[27px] sm:text-[34px]"}`} style={{ color: "var(--ed-ink)" }}>
          {copy.title}
        </h2>
        {!hideSubtitle ? (
          <p className={`font-reading ${compact ? "order-3 col-span-2 mt-0 max-w-[320px] text-[14px] leading-[1.45]" : `mt-2 ${footer ? "max-w-[260px] text-[14px] leading-[1.5]" : "text-[16px] sm:text-[18px]"}`}`} style={{ color: "var(--ed-body)" }}>
            {copy.subtitle}
          </p>
        ) : null}

        <form
          onSubmit={onSubmit}
          className={`box-border flex flex-row items-center rounded-[6px] border ${compact ? "order-2 col-start-2 mt-0 w-full min-w-0 gap-2 px-3 py-2" : footer ? "mt-4 w-full max-w-[244px] gap-2 px-3 py-2" : "mx-auto mt-7 w-full max-w-[390px] gap-3 px-4 py-3"}`}
          style={{
            borderColor: "color-mix(in srgb, var(--ed-ink) 10%, transparent)",
            background: "color-mix(in srgb, var(--ed-canvas) 92%, var(--ed-surface))",
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={copy.placeholder}
            autoComplete="email"
            className={`ed-subscribe-input font-display min-w-0 bg-transparent px-0 outline-none transition-opacity ${footer || compact ? "h-7 w-0 flex-1 text-[14px]" : "h-8 w-full text-[16px]"}`}
            style={{
              color: "var(--ed-ink)",
            }}
            disabled={state === "loading"}
          />
          <button
            type="submit"
            disabled={state === "loading"}
            aria-label={copy.cta}
            className={`font-display inline-flex shrink-0 items-center justify-center rounded-[6px] px-0 font-semibold transition-[background-color,opacity,transform] duration-300 ease-out disabled:cursor-not-allowed disabled:opacity-90 ${state === "success" ? "scale-100" : ""} ${footer ? "h-8 w-8 text-[14px]" : "h-8 w-8 text-[14px]"}`}
            style={{
              background: state === "success" ? "#16a34a" : hasEmail ? "var(--ed-action-bg)" : "var(--ed-button-muted)",
              color: state === "success" ? "#ffffff" : hasEmail ? "var(--ed-action-fg)" : "var(--ed-canvas)",
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
            style={{ color: "#c73c28" }}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  )
}
