"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Github, Globe2 } from "lucide-react"
import { useState } from "react"
import DiscordIcon from "@/components/DiscordIcon"
import XIcon from "@/components/XIcon"
import { SubscribePanel } from "./SubscribePanel"
import { ThemeToggle } from "./ThemeToggle"
import { rememberEditorialLocale } from "./localePreference"
import { externalLinks } from "@/lib/external-links"
import { externalAnchorProps } from "@/lib/link-behavior"

const LOCALE_EXIT_MS = 160

export function SiteFooter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLocaleNavigating, setIsLocaleNavigating] = useState(false)
  const locale = searchParams.get("lang") === "zh" ? "zh" : "en"
  const isZh = locale === "zh"
  const languageLabel = locale === "zh" ? "中文" : "English"
  const regionLabel = locale === "zh" ? "中国" : "United States"
  const columns =
    locale === "zh"
      ? [
          {
            title: "开发者",
            links: [
              { label: "开发者入口", href: "/developer?lang=zh" },
              { label: "文档", href: externalLinks.docs },
              { label: "API 文档", href: externalLinks.apiDocs },
              { label: "API 登录", href: externalLinks.apiLogin },
            ],
          },
          {
            title: "产品",
            links: [
              { label: "应用", href: "https://app.subfrost.io" },
              { label: "市场", href: "/#markets" },
              { label: "金库", href: "/#vaults" },
              { label: "生态系统", href: "/ecosystem?lang=zh" },
            ],
          },
          {
            title: "公司",
            links: [
              { label: "支持", href: "/support?lang=zh" },
              { label: "品牌资源", href: "/brand?lang=zh" },
              { label: "服务条款", href: "/terms?lang=zh" },
              { label: "隐私政策", href: "/privacy?lang=zh" },
            ],
          },
        ]
      : [
          {
            title: "Developer",
            links: [
              { label: "Developer", href: "/developer" },
              { label: "Docs", href: externalLinks.docs },
              { label: "API docs", href: externalLinks.apiDocs },
              { label: "API login", href: externalLinks.apiLogin },
            ],
          },
          {
            title: "Product",
            links: [
              { label: "App", href: "https://app.subfrost.io" },
              { label: "Markets", href: "/#markets" },
              { label: "Vaults", href: "/#vaults" },
              { label: "Ecosystem", href: "/ecosystem" },
            ],
          },
          {
            title: "Company",
            links: [
              { label: "Support", href: "/support" },
              { label: "Brand kit", href: "/brand" },
              { label: "Terms", href: "/terms" },
              { label: "Privacy", href: "/privacy" },
            ],
          },
        ]

  function toggleLocale() {
    if (isLocaleNavigating) return

    const nextLocale = isZh ? "en" : "zh"
    const params = new URLSearchParams(searchParams.toString())
    params.set("lang", nextLocale)
    rememberEditorialLocale(nextLocale)
    setIsLocaleNavigating(true)

    const root = document.getElementById("ed-root")
    root?.classList.add("ed-page-exiting")

    window.setTimeout(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
      setIsLocaleNavigating(false)
    }, LOCALE_EXIT_MS)
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
                  {...externalAnchorProps(link.href)}
                  className="font-display text-[14px] font-normal transition-opacity hover:opacity-65"
                  style={{ color: "var(--ed-ink)" }}
                >
                  <span>{link.label}</span>
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
            href="https://discord.gg/qrWgJgNAUj"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Subfrost on Discord"
            className="transition-opacity hover:opacity-65"
            style={{ color: "var(--ed-ink)" }}
          >
            <DiscordIcon className="h-4 w-4" />
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
          <span>&copy; 2026 Subzero Research Inc.</span>
        </div>

        <div className="font-display flex items-center justify-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={toggleLocale}
            disabled={isLocaleNavigating}
            aria-busy={isLocaleNavigating}
            aria-label={`Switch to ${isZh ? "English" : "Chinese"}`}
            className="inline-flex h-10 items-center gap-2 rounded-full px-4 outline-none disabled:pointer-events-none disabled:opacity-55 focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
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
