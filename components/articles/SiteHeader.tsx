"use client"

import Link from "next/link"
import type { MouseEvent } from "react"
import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowUpRight, PanelRight, Search, X } from "lucide-react"
import { LocaleToggle } from "./LocaleToggle"

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const locale = searchParams.get("lang") === "zh" ? "zh" : "en"
  const articleHref = locale === "zh" ? "/articles?lang=zh" : "/articles"
  const searchHref = locale === "zh" ? "/articles?lang=zh#article-search" : "/articles#article-search"
  const copy = {
    en: {
      markets: "Markets",
      swap: "Swap",
      vaults: "Vaults",
      blog: "Blog",
      try: "Launch App",
      tryShort: "Launch",
      search: "Search articles",
      closeSearch: "Close search",
      openNav: "Open navigation",
    },
    zh: {
      markets: "市场",
      swap: "兑换",
      vaults: "金库",
      blog: "博客",
      try: "启动应用",
      tryShort: "进入",
      search: "搜索文章",
      closeSearch: "关闭搜索",
      openNav: "打开导航",
    },
  }[locale]
  const navItems = [
    { id: "markets", label: copy.markets, href: "https://app.subfrost.io/" },
    { id: "swap", label: copy.swap, href: "https://app.subfrost.io/" },
    { id: "vaults", label: copy.vaults, href: "https://app.subfrost.io/" },
    { id: "blog", label: copy.blog, href: articleHref },
  ]
  const activeId = pathname?.startsWith("/articles") || pathname?.startsWith("/authors") ? "blog" : "markets"

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled((current) => {
        if (!current && y > 72) return true
        if (current && y < 24) return false
        return current
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const onHashChange = () => setSearchOpen(window.location.hash === "#article-search")
    onHashChange()
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen])

  function toggleSearch(event: MouseEvent<HTMLAnchorElement>) {
    if (!pathname?.startsWith("/articles")) return
    event.preventDefault()
    setMobileMenuOpen(false)
    const nextUrl = searchOpen ? articleHref : searchHref
    window.history.pushState(null, "", nextUrl)
    window.dispatchEvent(new HashChangeEvent("hashchange"))
  }

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "var(--ed-canvas)",
      }}
    >
      <div className={`mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 ${scrolled ? "sm:px-5" : ""}`}>
        <div className="flex min-w-0 items-center gap-5">
          <Link href="/" className="flex shrink-0 items-center" aria-label="Subfrost">
            <span className="relative block h-8 w-[148px]">
              <img
                src="/brand/subfrost/Logos/svg/logotype/logotype_black.svg"
                alt="Subfrost"
                className="ed-logo-light h-full w-auto"
              />
              <img
                src="/brand/subfrost/Logos/svg/logotype/logotype_white.svg"
                alt=""
                aria-hidden="true"
                className="ed-logo-dark absolute inset-0 h-full w-auto"
              />
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-[14px] sm:flex">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`font-display rounded-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)] ${
                  item.id === activeId ? "text-[color:var(--ed-ink)]" : "text-[color:var(--ed-muted)]"
                }`}
              >
                {item.label}
              </a>
            ))}
            <a
              href={searchOpen ? articleHref : searchHref}
              onClick={toggleSearch}
              aria-label={searchOpen ? copy.closeSearch : copy.search}
              className="font-display rounded-sm text-[color:var(--ed-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
            >
              {searchOpen ? <X size={16} strokeWidth={2} /> : <Search size={16} strokeWidth={2} />}
            </a>
          </nav>
        </div>

        <div className="hidden shrink-0 items-center gap-5 text-[14px] sm:flex">
          <span
            className="flex items-center gap-3"
            style={{ color: "var(--ed-muted)" }}
          >
            <LocaleToggle />
          </span>
          <a
            href="https://app.subfrost.io/"
            className="font-display inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-medium sm:px-5 sm:text-[13px]"
            style={{
              background: "var(--ed-ink)",
              color: "var(--ed-canvas)",
            }}
          >
            <span className="hidden sm:inline">{copy.try}</span>
            <span className="sm:hidden">{copy.tryShort}</span>
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.4} />
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-5 sm:hidden" style={{ color: "var(--ed-muted)" }}>
          <a
            href={searchOpen ? articleHref : searchHref}
            onClick={toggleSearch}
            aria-label={searchOpen ? copy.closeSearch : copy.search}
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
          >
            {searchOpen ? <X size={17} strokeWidth={2} /> : <Search size={17} strokeWidth={2} />}
          </a>
          <button
            type="button"
            aria-label={copy.openNav}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
          >
            <PanelRight size={18} strokeWidth={1.9} />
          </button>
        </div>
      </div>
      <div
        className={`fixed inset-x-0 bottom-0 top-16 z-40 sm:hidden overflow-y-auto transition-[opacity,transform,visibility] duration-300 ease-[cubic-bezier(0,0,0,1)] ${
          mobileMenuOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-2 opacity-0 pointer-events-none"
        }`}
        style={{ background: "var(--ed-canvas)" }}
      >
        <div className="flex min-h-full flex-col px-4 pb-10 pt-7">
          <nav className="flex flex-col gap-4">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="font-display text-[42px] font-normal leading-[1.08] text-[color:var(--ed-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="my-10 h-px w-full bg-[color:var(--ed-hair)]" />

          <a
            href="https://app.subfrost.io/"
            onClick={() => setMobileMenuOpen(false)}
            className="font-display inline-flex items-center gap-2 text-[38px] font-normal leading-none text-[color:var(--ed-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
          >
            {copy.try}
            <ArrowUpRight className="h-8 w-8" strokeWidth={2} />
          </a>

          <div className="mt-9 flex items-center text-[color:var(--ed-muted)]">
            <LocaleToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
