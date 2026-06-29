"use client"

import Link from "next/link"
import type { CSSProperties, FormEvent, MouseEvent } from "react"
import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowUp, ArrowUpRight, PanelRight, Search, X } from "lucide-react"
import { LocaleToggle } from "./LocaleToggle"
import { externalLinks } from "@/lib/external-links"
import { externalAnchorProps } from "@/lib/link-behavior"

type MenuId = "trade" | "developer" | "downloads"

type MenuItem = {
  id: string
  label: string
  body?: string
  href?: string
  status?: string
}

type MegaMenu = {
  id: MenuId
  label: string
  eyebrow: string
  primary: MenuItem[]
  resources?: MenuItem[]
}

type SiteSearchResult = {
  id: string
  type: "page" | "product" | "docs" | "article" | "author"
  title: string
  description: string
  href: string
  section: string
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [activeMenu, setActiveMenu] = useState<MenuId | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SiteSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MenuId | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const overlayOpenRef = useRef(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const locale = searchParams.get("lang") === "zh" ? "zh" : "en"
  const homeHref = locale === "zh" ? "/?lang=zh" : "/"
  const articleHref = locale === "zh" ? "/articles?lang=zh" : "/articles"
  const volumeHref = locale === "zh" ? "/volume?lang=zh" : "/volume"
  const copy = {
    en: {
      trade: "Trade",
      developer: "Developer",
      markets: "Markets",
      swap: "Swap",
      vaults: "Vaults",
      volumeCharts: "Volume",
      marketsBody: "Live BTC markets and protocol data.",
      swapBody: "AMM liquidity for Bitcoin-native assets.",
      vaultsBody: "Structured vault products for BTC and protocol assets.",
      volumeChartsBody: "Wrap and unwrap volume across Both, Alkanes, and BRC2.0.",
      developerGateway: "Gateway",
      developerGatewayBody: "Technical overview, API references, protocol notes, and app entry points.",
      docs: "Docs",
      docsBody: "Product guides, setup paths, protocol references, and technical components.",
      apiDocs: "API docs",
      apiDocsBody: "Endpoint context for balances, wrapping state, transactions, and integrations.",
      apiLogin: "API login",
      apiLoginBody: "Sign in to the live API dashboard.",
      downloads: "Downloads",
      chromeExtension: "Chrome extension",
      chromeExtensionBody: "Available now in the Chrome Web Store.",
      ios: "iOS",
      iosBody: "Mobile app coming soon.",
      android: "Android",
      androidBody: "Mobile app coming soon.",
      comingSoon: "Coming soon",
      technicalOverview: "Technical overview",
      alkanesIntegration: "Alkanes integration",
      brc20Integration: "BRC2.0 integration",
      frbtcAlkanes: "frBTC on Alkanes",
      frbtcBrc20: "FR-BTC on BRC2.0",
      support: "Support",
      resources: "Resources",
      blog: "Articles",
      try: "Launch App",
      tryShort: "Launch",
      search: "Search",
      closeSearch: "Close search",
      searchPlaceholder: "Search subfrost",
      searchResults: "Results",
      searchEmpty: "No results found.",
      searchStart: "Search articles, docs, products, and protocol pages.",
      searchLoading: "Searching",
      searchSubmit: "Open first result",
      openNav: "Open navigation",
    },
    zh: {
      trade: "交易",
      developer: "开发者",
      markets: "市场",
      swap: "兑换",
      vaults: "金库",
      volumeCharts: "交易量",
      marketsBody: "实时 BTC 市场与协议数据。",
      swapBody: "面向比特币原生资产的 AMM 流动性。",
      vaultsBody: "面向 BTC 与协议资产的结构化金库产品。",
      volumeChartsBody: "查看 Both、Alkanes 与 BRC2.0 的包装与解包交易量。",
      developerGateway: "入口",
      developerGatewayBody: "技术概览、API 参考、协议说明与应用入口。",
      docs: "文档",
      docsBody: "产品指南、设置路径、协议参考与技术组件。",
      apiDocs: "API 文档",
      apiDocsBody: "余额、包装状态、交易与集成端点说明。",
      apiLogin: "API 登录",
      apiLoginBody: "登录实时 API 控制台。",
      downloads: "下载",
      chromeExtension: "Chrome 扩展",
      chromeExtensionBody: "现已在 Chrome 网上应用店提供。",
      ios: "iOS",
      iosBody: "移动应用即将推出。",
      android: "Android",
      androidBody: "移动应用即将推出。",
      comingSoon: "即将推出",
      technicalOverview: "技术概览",
      alkanesIntegration: "Alkanes 集成",
      brc20Integration: "BRC2.0 集成",
      frbtcAlkanes: "Alkanes 上的 frBTC",
      frbtcBrc20: "BRC2.0 上的 FR-BTC",
      support: "支持",
      resources: "资源",
      blog: "文章",
      try: "启动应用",
      tryShort: "进入",
      search: "搜索",
      closeSearch: "关闭搜索",
      searchPlaceholder: "搜索 subfrost",
      searchResults: "结果",
      searchEmpty: "没有找到结果。",
      searchStart: "搜索文章、文档、产品和协议页面。",
      searchLoading: "搜索中",
      searchSubmit: "打开第一个结果",
      openNav: "打开导航",
    },
  }[locale]
  const tradeItems = [
    { id: "markets", label: copy.markets, body: copy.marketsBody, href: "https://app.subfrost.io/markets" },
    { id: "swap", label: copy.swap, body: copy.swapBody, href: "https://app.subfrost.io/swap" },
    { id: "vaults", label: copy.vaults, body: copy.vaultsBody, href: "https://app.subfrost.io/vaults" },
    { id: "volume", label: copy.volumeCharts, body: copy.volumeChartsBody, href: volumeHref },
  ]
  const developerHref = locale === "zh" ? "/developer?lang=zh" : "/developer"
  const docsHref = externalLinks.docs
  const apiDocsHref = externalLinks.apiDocs
  const technicalHref = "https://docs.subfrost.io/introduction/technical-overview"
  const developerMenus: MegaMenu[] = [
    {
      id: "trade",
      label: copy.trade,
      eyebrow: copy.trade,
      primary: tradeItems,
    },
    {
      id: "developer",
      label: copy.developer,
      eyebrow: copy.developer,
      primary: [
        { id: "gateway", label: copy.developerGateway, body: copy.developerGatewayBody, href: developerHref },
        { id: "docs", label: copy.docs, body: copy.docsBody, href: docsHref },
        { id: "api", label: copy.apiDocs, body: copy.apiDocsBody, href: apiDocsHref },
        { id: "api-login", label: copy.apiLogin, body: copy.apiLoginBody, href: externalLinks.apiLogin },
      ],
      resources: [
        { id: "technical", label: copy.technicalOverview, href: technicalHref },
        { id: "alkanes", label: copy.alkanesIntegration, href: "https://docs.subfrost.io/developer-guide/alkanes-integration" },
        { id: "brc20", label: copy.brc20Integration, href: "https://docs.subfrost.io/developer-guide/brc20-prog/" },
        { id: "frbtc-alkanes", label: copy.frbtcAlkanes, href: "https://docs.subfrost.io/developer-guide/wrapping-frBTC/" },
        { id: "frbtc-brc20", label: copy.frbtcBrc20, href: "https://docs.subfrost.io/developer-guide/frBTC-brc20/" },
        { id: "support", label: copy.support, href: locale === "zh" ? "/support?lang=zh" : "/support" },
      ],
    },
    {
      id: "downloads",
      label: copy.downloads,
      eyebrow: copy.downloads,
      primary: [
        {
          id: "chrome-extension",
          label: copy.chromeExtension,
          body: copy.chromeExtensionBody,
          href: externalLinks.chromeExtension,
        },
        { id: "ios", label: copy.ios, body: copy.iosBody, status: copy.comingSoon },
        { id: "android", label: copy.android, body: copy.androidBody, status: copy.comingSoon },
      ],
    },
  ]
  const navItems = [{ id: "blog", label: copy.blog, href: articleHref }]
  const developerMenu = developerMenus.find((menu) => menu.id === "developer")
  const activeMobileMenu = mobilePanel ? developerMenus.find((menu) => menu.id === mobilePanel) : null
  const activeId =
    pathname?.startsWith("/articles") || pathname?.startsWith("/authors")
      ? "blog"
      : pathname?.startsWith("/developer") || pathname?.startsWith("/docs")
        ? "developer"
        : null

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
    setActiveMenu(null)
    setMobileMenuOpen(false)
    setMobilePanel(null)
    setSearchOpen(false)
  }, [pathname, searchParams])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!activeMenu && !mobileMenuOpen && !searchOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      setActiveMenu(null)
      setMobileMenuOpen(false)
      setMobilePanel(null)
      setSearchOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeMenu, mobileMenuOpen, searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 90)
    return () => window.clearTimeout(id)
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const controller = new AbortController()
    const id = window.setTimeout(async () => {
      setSearchLoading(true)
      try {
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          lang: locale,
          limit: "10",
        })
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
        if (!response.ok) return
        const payload = (await response.json()) as { results?: SiteSearchResult[] }
        setSearchResults(payload.results ?? [])
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setSearchResults([])
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, searchQuery.trim() ? 110 : 0)

    return () => {
      window.clearTimeout(id)
      controller.abort()
    }
  }, [locale, searchOpen, searchQuery])

  function toggleSearch() {
    setActiveMenu(null)
    setMobileMenuOpen(false)
    setMobilePanel(null)
    setSearchOpen((value) => !value)
  }

  function toggleMenu(menu: MenuId) {
    setMobileMenuOpen(false)
    setMobilePanel(null)
    setSearchOpen(false)
    setActiveMenu((value) => value === menu ? null : menu)
  }

  function openDesktopMenu(menu: MenuId) {
    setMobileMenuOpen(false)
    setSearchOpen(false)
    setActiveMenu(menu)
  }

  function closeDesktopMenu() {
    setActiveMenu(null)
  }

  function closeSearch() {
    setSearchOpen(false)
  }

  function closeOverlays() {
    setActiveMenu(null)
    setMobileMenuOpen(false)
    setMobilePanel(null)
    setSearchOpen(false)
  }

  function toggleMobileMenu() {
    setActiveMenu(null)
    setSearchOpen(false)
    setMobileMenuOpen((value) => {
      if (value) setMobilePanel(null)
      return !value
    })
  }

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!searchQuery.trim()) return
    const first = searchResults[0]
    if (!first) return
    window.location.href = first.href
  }

  const hasSearchQuery = searchQuery.trim().length > 0
  const canSubmitSearch = hasSearchQuery && searchResults.length > 0
  overlayOpenRef.current = Boolean(activeMenu) || mobileMenuOpen || searchOpen

  function onLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!overlayOpenRef.current) return
    event.preventDefault()
    event.stopPropagation()
    closeOverlays()
  }

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "var(--ed-canvas)",
      }}
      onMouseLeave={closeDesktopMenu}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        closeDesktopMenu()
      }}
    >
      <div className={`mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 ${scrolled ? "sm:px-5" : ""}`}>
        <div className="flex min-w-0 items-center gap-5">
          <Link
            href={homeHref}
            className="flex shrink-0 items-center"
            aria-label="subfrost"
            onMouseEnter={closeDesktopMenu}
            onFocus={closeDesktopMenu}
            onClickCapture={onLogoClick}
          >
            <span className="relative block h-8 w-[148px]">
              <img
                src="/brand/subfrost/Logos/svg/logotype/logotype_dark.svg"
                alt="subfrost"
                className="ed-logo-light h-full w-auto"
              />
              <img
                src="/brand/subfrost/Logos/svg/logotype/logotype_light.svg"
                alt=""
                aria-hidden="true"
                className="ed-logo-dark absolute inset-0 h-full w-auto"
              />
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-[14px] sm:flex">
            {developerMenus.map((menu) => (
              <button
                key={menu.id}
                type="button"
                onClick={() => toggleMenu(menu.id)}
                onMouseEnter={() => openDesktopMenu(menu.id)}
                onFocus={() => openDesktopMenu(menu.id)}
                onMouseDown={(event) => event.preventDefault()}
                className={`font-display inline-flex rounded-sm font-normal outline-none transition-colors duration-200 hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)] ${
                  activeMenu === menu.id ? "text-[color:var(--ed-ink)]" : "text-[color:var(--ed-muted)]"
                }`}
                aria-haspopup="true"
                aria-expanded={activeMenu === menu.id}
              >
                {menu.label}
              </button>
            ))}
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onMouseEnter={() => {
                  closeDesktopMenu()
                  closeSearch()
                }}
                onFocus={() => {
                  closeDesktopMenu()
                  closeSearch()
                }}
                className={`font-display rounded-sm font-normal outline-none transition-colors duration-200 hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)] ${
                  item.id === activeId ? "text-[color:var(--ed-ink)]" : "text-[color:var(--ed-muted)]"
                }`}
              >
                {item.label}
              </a>
            ))}
            <button
              type="button"
              onClick={toggleSearch}
              onMouseEnter={closeDesktopMenu}
              onFocus={closeDesktopMenu}
              aria-label={copy.search}
              aria-expanded={searchOpen}
              className="font-display inline-flex h-5 w-5 items-center justify-center rounded-sm text-[color:var(--ed-muted)] outline-none transition-colors duration-200 hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
            >
              <Search size={16} strokeWidth={2} />
            </button>
          </nav>
        </div>

        <div className="hidden shrink-0 items-center gap-5 text-[14px] sm:flex">
          <span
            className="flex items-center gap-3"
            style={{ color: "var(--ed-muted)" }}
            onMouseEnter={closeDesktopMenu}
            onFocus={closeDesktopMenu}
          >
            <LocaleToggle />
          </span>
          <a
            href="https://app.subfrost.io/"
            {...externalAnchorProps("https://app.subfrost.io/")}
            onMouseEnter={closeDesktopMenu}
            onFocus={closeDesktopMenu}
            className="font-display inline-flex h-9 w-[122px] items-center justify-center gap-1.5 rounded-[6px] border px-0 text-[13px] font-medium"
            style={{
              background: "var(--ed-action-bg)",
              color: "var(--ed-action-fg)",
              borderColor: "color-mix(in srgb, var(--ed-canvas) 12%, transparent)",
            }}
          >
            <span className="hidden sm:inline">{copy.try}</span>
            <span className="sm:hidden">{copy.tryShort}</span>
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.4} />
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-5 sm:hidden" style={{ color: "var(--ed-muted)" }}>
          <button
            type="button"
            onClick={toggleSearch}
            aria-label={copy.search}
            aria-expanded={searchOpen}
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm outline-none transition-colors duration-200 hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
          >
            <Search size={17} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={copy.openNav}
            aria-expanded={mobileMenuOpen}
            onClick={toggleMobileMenu}
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
          >
            {mobileMenuOpen ? <X size={18} strokeWidth={1.9} /> : <PanelRight size={18} strokeWidth={1.9} />}
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
          {mobilePanel ? (
            <div
              className="animate-in fade-in slide-in-from-right-2 duration-300"
              style={{ animationTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
            >
              <button
                type="button"
                onClick={() => setMobilePanel(null)}
                className="font-display mb-12 text-[16px] font-normal text-[color:var(--ed-ink)] outline-none transition-colors duration-200 hover:text-[color:var(--ed-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
              >
                Home
              </button>
              <nav className="flex flex-col gap-4">
                {(activeMobileMenu?.primary ?? []).map((item) =>
                  item.href ? (
                    <a
                      key={item.label}
                      href={item.href}
                      {...externalAnchorProps(item.href)}
                      onClick={() => setMobileMenuOpen(false)}
                      className="font-display inline-flex items-center gap-2 text-[34px] font-normal leading-[1.12] text-[color:var(--ed-ink)] outline-none transition-colors duration-200 hover:text-[color:var(--ed-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
                    >
                      {item.label}
                      <ArrowUpRight className="h-5 w-5" strokeWidth={1.8} />
                    </a>
                  ) : (
                    <div key={item.label} aria-disabled="true" className="font-display text-[34px] font-normal leading-[1.12] text-[color:var(--ed-muted)]">
                      <span className="inline-flex items-baseline gap-3">
                        {item.label}
                        {item.status ? <span className="text-[13px] font-medium uppercase tracking-[0.08em] opacity-70">{item.status}</span> : null}
                      </span>
                    </div>
                  ),
                )}
              </nav>
              {mobilePanel === "developer" && developerMenu?.resources ? (
                <>
                  <div className="my-10 h-px w-full bg-[color:var(--ed-hair)]" />
                  <nav className="flex flex-col gap-4">
                    {developerMenu.resources.map((item) => (
                      <a
                        key={item.id}
                        href={item.href}
                        {...externalAnchorProps(item.href)}
                        onClick={() => setMobileMenuOpen(false)}
                        className="font-display inline-flex items-center gap-1.5 text-[16px] font-medium text-[color:var(--ed-ink)] outline-none transition-colors duration-200 hover:text-[color:var(--ed-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
                      >
                        {item.label}
                        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </a>
                    ))}
                  </nav>
                </>
              ) : null}
            </div>
          ) : (
            <div
              className="animate-in fade-in slide-in-from-left-2 duration-300"
              style={{ animationTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
            >
              <nav className="flex flex-col gap-4">
                {developerMenus.map((menu) => (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => setMobilePanel(menu.id)}
                    className="font-display text-left text-[34px] font-normal leading-[1.12] text-[color:var(--ed-ink)] outline-none transition-colors duration-200 hover:text-[color:var(--ed-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
                  >
                    {menu.label}
                  </button>
                ))}
                {navItems.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="font-display text-[34px] font-normal leading-[1.12] text-[color:var(--ed-ink)] outline-none transition-colors duration-200 hover:text-[color:var(--ed-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              <div className="my-10 h-px w-full bg-[color:var(--ed-hair)]" />

              <a
                href="https://app.subfrost.io/"
                {...externalAnchorProps("https://app.subfrost.io/")}
                onClick={() => setMobileMenuOpen(false)}
                className="font-display inline-flex items-center gap-2 text-[34px] font-normal leading-none text-[color:var(--ed-ink)] outline-none transition-colors duration-200 hover:text-[color:var(--ed-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
              >
                {copy.try}
                <ArrowUpRight className="h-7 w-7" strokeWidth={2} />
              </a>

              <div className="mt-9 flex items-center text-[color:var(--ed-muted)]">
                <LocaleToggle />
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        className={`fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto transition-[opacity,transform,visibility] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          searchOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0 pointer-events-none"
        }`}
        style={{ background: "var(--ed-canvas)" }}
        aria-hidden={!searchOpen}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement
          if (target.closest("[data-search-panel]")) return
          closeSearch()
        }}
      >
        <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-12">
          <form
            data-search-panel
            onSubmit={onSearchSubmit}
            className={`mx-auto flex max-w-[920px] items-center gap-4 border-b pb-4 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              searchOpen ? "translate-y-0 opacity-100 delay-75" : "translate-y-4 opacity-0"
            }`}
            style={{ borderColor: "var(--ed-hair)" }}
          >
            <Search className="h-5 w-5 shrink-0 text-[color:var(--ed-muted)] sm:h-6 sm:w-6" strokeWidth={1.8} />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchPlaceholder}
              className="font-display min-w-0 flex-1 bg-transparent text-[28px] font-normal leading-none text-[color:var(--ed-ink)] outline-none placeholder:text-[color:var(--ed-placeholder)] sm:text-[42px]"
            />
            <button
              type="submit"
              aria-label={copy.searchSubmit}
              disabled={!canSubmitSearch}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[background,color,opacity,transform] duration-300 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-45"
              style={{
                background: hasSearchQuery ? "var(--ed-action-bg)" : "color-mix(in srgb, var(--ed-ink) 38%, transparent)",
                color: hasSearchQuery ? "var(--ed-action-fg)" : "var(--ed-canvas)",
              }}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </form>

          <div
            data-search-panel
            className={`mx-auto mt-8 max-w-[920px] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              searchOpen ? "translate-y-0 opacity-100 delay-100" : "translate-y-4 opacity-0"
            }`}
          >
            <div className="mb-5 flex min-h-5 items-center justify-between gap-4">
              <p className="font-display text-[14px] font-medium text-[color:var(--ed-muted)]">
                {searchQuery.trim() ? copy.searchResults : copy.searchStart}
              </p>
              {searchLoading ? (
                <p className="font-display text-[13px] text-[color:var(--ed-muted)]">{copy.searchLoading}</p>
              ) : null}
            </div>

            {searchResults.length > 0 ? (
              <div className="grid gap-2">
                {searchResults.map((result, index) => (
                  <a
                    key={result.id}
                    href={result.href}
                    {...externalAnchorProps(result.href)}
                    onClick={closeSearch}
                    className="site-search-result group grid gap-3 rounded-[6px] px-0 py-3 outline-none transition-[background,transform] duration-300 hover:translate-x-1 focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)] sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-6 sm:px-3"
                    style={{ "--search-result-index": index } as CSSProperties}
                  >
                    <span className="font-display text-[13px] font-medium text-[color:var(--ed-muted)]">
                      {result.section}
                    </span>
                    <span className="min-w-0">
                      <span className="font-display flex items-center gap-2 text-[20px] leading-[1.2] text-[color:var(--ed-ink)] sm:text-[24px]">
                        <span className="truncate">{result.title}</span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 opacity-35 transition-[opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" strokeWidth={1.8} />
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[14px] leading-[1.45] text-[color:var(--ed-body)]">
                        {result.description}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            ) : searchQuery.trim() && !searchLoading ? (
              <p className="font-display text-[18px] text-[color:var(--ed-muted)]">{copy.searchEmpty}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className={`fixed inset-x-0 bottom-0 top-16 z-40 hidden overflow-y-auto sm:block transition-[transform,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          activeMenu ? "visible translate-y-0" : "invisible -translate-y-2 pointer-events-none"
        }`}
        style={{ background: "var(--ed-canvas)" }}
        aria-hidden={!activeMenu}
      >
        <div className="mx-auto max-w-[1440px] px-6 py-12">
          <div className="relative min-h-[245px]">
            {developerMenus.map((menu) => {
              const isOpen = activeMenu === menu.id
              return (
                <div
                  key={menu.id}
                  aria-hidden={!isOpen}
                  className={`absolute inset-x-0 top-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isOpen ? "pointer-events-auto translate-y-0 opacity-100 delay-75" : "pointer-events-none translate-y-2 opacity-0"
                  }`}
                >
                  <div
                    className={`transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isOpen ? "translate-y-0 opacity-100 delay-75" : "translate-y-3 opacity-0"
                    }`}
                  >
                    <p className="font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                      {menu.eyebrow}
                    </p>
                  </div>
                  <div
                    className={`mt-10 grid gap-12 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      menu.resources ? "lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.34fr)]" : ""
                    } ${isOpen ? "translate-y-0 opacity-100 delay-100" : "translate-y-3 opacity-0"}`}
                  >
                    <div className={`grid gap-x-8 gap-y-9 ${menu.primary.length > 3 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
                      {menu.primary.map((item) => {
                        const content = (
                          <>
                            <span
                              className="font-display inline-flex items-center gap-2 text-[34px] font-normal leading-none lg:text-[38px]"
                              style={{ color: item.href ? "var(--ed-ink)" : "var(--ed-muted)" }}
                            >
                              {item.label}
                              {item.href ? (
                                <ArrowUpRight className="h-5 w-5 opacity-45 transition-[opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" strokeWidth={1.8} />
                              ) : item.status ? (
                                <span className="text-[12px] font-medium uppercase tracking-[0.08em] opacity-65">{item.status}</span>
                              ) : null}
                            </span>
                            {item.body ? (
                              <span className="mt-3 block max-w-[300px] text-[15px] leading-[1.5]" style={{ color: "var(--ed-muted)" }}>
                                {item.body}
                              </span>
                            ) : null}
                          </>
                        )

                        return item.href ? (
                          <a
                            key={item.id}
                            href={item.href}
                            {...externalAnchorProps(item.href)}
                            onClick={() => setActiveMenu(null)}
                            className="group outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
                          >
                            {content}
                          </a>
                        ) : (
                          <div key={item.id} aria-disabled="true" className="cursor-default">
                            {content}
                          </div>
                        )
                      })}
                    </div>
                    {menu.resources ? (
                      <div className="lg:pl-2">
                        <p className="font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                          {copy.resources}
                        </p>
                        <div className="mt-5 grid gap-4">
                          {menu.resources.map((item) => (
                            <a
                              key={item.id}
                              href={item.href}
                              {...externalAnchorProps(item.href)}
                              onClick={() => setActiveMenu(null)}
                              className="group font-display inline-flex items-center text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
                              style={{ color: "var(--ed-ink)" }}
                            >
                              {item.label}
                              <ArrowUpRight className="ml-1 h-3.5 w-3.5 opacity-45 transition-[opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" strokeWidth={1.8} />
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
}
