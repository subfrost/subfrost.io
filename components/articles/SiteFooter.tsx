"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowUpRight, Github, Globe2 } from "lucide-react"
import XIcon from "@/components/XIcon"
import { SubscribePanel } from "./SubscribePanel"
import { ThemeToggle } from "./ThemeToggle"

export function SiteFooter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const locale = searchParams.get("lang") === "zh" ? "zh" : "en"
  const isZh = locale === "zh"
  const languageLabel = locale === "zh" ? "中文" : "English"
  const regionLabel = locale === "zh" ? "中国" : "United States"
  const termsLabel = locale === "zh" ? "服务条款" : "Terms"
  const privacyLabel = locale === "zh" ? "隐私政策" : "Privacy"
  const columns =
    locale === "zh"
      ? [
          {
            title: "开发者",
            links: [
              { label: "文档", href: "https://docs.subfrost.io/" },
              { label: "技术概览", href: "https://docs.subfrost.io/introduction/technical-overview" },
              { label: "API 文档", href: "https://docs.subfrost.io/introduction/subfrost-api-docs" },
            ],
          },
          {
            title: "产品",
            links: [
              { label: "应用", href: "https://app.subfrost.io" },
              { label: "市场", href: "/#markets" },
              { label: "金库", href: "/#vaults" },
            ],
          },
          {
            title: "公司",
            links: [
              { label: "支持", href: "/support" },
              { label: "服务条款", href: "/terms" },
              { label: "隐私政策", href: "/privacy" },
            ],
          },
        ]
      : [
          {
            title: "Developer",
            links: [
              { label: "Docs", href: "https://docs.subfrost.io/" },
              { label: "Technical overview", href: "https://docs.subfrost.io/introduction/technical-overview" },
              { label: "API docs", href: "https://docs.subfrost.io/introduction/subfrost-api-docs" },
            ],
          },
          {
            title: "Product",
            links: [
              { label: "App", href: "https://app.subfrost.io" },
              { label: "Markets", href: "/#markets" },
              { label: "Vaults", href: "/#vaults" },
            ],
          },
          {
            title: "Company",
            links: [
              { label: "Support", href: "/support" },
              { label: "Terms", href: "/terms" },
              { label: "Privacy", href: "/privacy" },
            ],
          },
        ]

  function toggleLocale() {
    const params = new URLSearchParams(searchParams.toString())
    params.set("lang", isZh ? "en" : "zh")
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <footer className="mt-16" style={{ background: "var(--ed-canvas)", color: "var(--ed-ink)" }}>
      <div className="mx-auto grid max-w-[1440px] gap-x-8 gap-y-10 px-5 pb-12 pt-8 sm:px-8 lg:grid-cols-4">
        <SubscribePanel locale={locale} footer />
        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="font-display text-[14px] font-normal" style={{ color: "var(--ed-muted)" }}>
              {column.title}
            </h3>
            <div className="mt-4 flex flex-col gap-4">
              {column.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="font-display text-[14px] font-normal transition-opacity hover:opacity-65"
                  style={{ color: "var(--ed-ink)" }}
                >
                  <span className="inline-flex items-baseline gap-1">
                    <span>{link.label}</span>
                    {link.href.startsWith("http") ? <ArrowUpRight className="relative top-[1px] h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" /> : null}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto grid max-w-[1440px] justify-items-center gap-6 px-5 py-8 text-center text-[13px] sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:justify-items-stretch lg:text-left">
        <div className="flex items-center justify-center gap-6 lg:justify-start">
          <a
            href="https://x.com/gabe_subfrost"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Subfrost on X"
            className="transition-opacity hover:opacity-65"
            style={{ color: "var(--ed-ink)" }}
          >
            <XIcon className="h-4 w-4" />
          </a>
          <a
            href="https://github.com/subfrost"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Subfrost on GitHub"
            className="transition-opacity hover:opacity-65"
            style={{ color: "var(--ed-ink)" }}
          >
            <Github className="h-4 w-4" strokeWidth={2.2} />
          </a>
        </div>

        <div className="font-display flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span>&copy; 2025 Subzero Research Inc.</span>
          <Link href="/terms" className="underline underline-offset-2 transition-opacity hover:opacity-65">
            {termsLabel}
          </Link>
          <Link href="/privacy" className="underline underline-offset-2 transition-opacity hover:opacity-65">
            {privacyLabel}
          </Link>
        </div>

        <div className="font-display flex items-center justify-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={toggleLocale}
            aria-label={`Switch to ${isZh ? "English" : "Chinese"}`}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
            style={{
              background: "color-mix(in srgb, var(--ed-ink) 7%, transparent)",
            }}
          >
            <Globe2 className="h-3.5 w-3.5" />
            <span>{languageLabel}</span>
            <span style={{ color: "var(--ed-muted)" }}>{regionLabel}</span>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  )
}
