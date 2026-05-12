"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { trackEvent } from "@/lib/analytics"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

const NAV_HEIGHT = 58

const sections = [
  { id: "native-assets", label: "Assets", offset: NAV_HEIGHT + 16 },
  { id: "subfrost-app", label: "App", offset: NAV_HEIGHT + 16 },
  { id: "team-partnerships", label: "Team & Partners", offset: 0 },
]

export default function StickyNav() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const heroHeight = window.innerHeight
      setIsVisible(window.scrollY > heroHeight)
    }

    window.addEventListener("scroll", handleScroll)
    handleScroll()

    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToSection = (sectionId: string, offset: number) => {
    const element = document.getElementById(sectionId)
    if (element) {
      if (offset > 0) {
        const top = element.getBoundingClientRect().top + window.scrollY - offset
        window.scrollTo({ top, behavior: "smooth" })
      } else {
        element.scrollIntoView({ behavior: "smooth" })
      }
    }
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
      }`}
    >
      <div className="bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.25),0_1px_0_rgba(0,0,0,0.05)]">
        <div className="max-w-7xl mx-auto px-5 h-[58px] flex items-center justify-between gap-4">
          {/* Brand */}
          <button
            onClick={() => { trackEvent("nav_logo_click", { event_category: "navigation", event_label: "sticky_nav" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            aria-label="Subfrost Home"
            className="flex items-center select-none flex-shrink-0"
          >
            <Image
              src="/brand/subfrost-wordmark.svg"
              alt="SUBFROST wordmark"
              width={180}
              height={24}
              priority
              className="hover:opacity-80 h-8 w-auto sf-wordmark"
            />
          </button>

          {/* Center Nav Links */}
          <div className="hidden md:flex items-center gap-4 ml-4">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => { trackEvent("nav_section_click", { event_category: "navigation", event_label: section.id }); scrollToSection(section.id, section.offset); }}
                className="text-sm font-semibold text-[color:var(--sf-text)] hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
              >
                {section.label}
              </button>
            ))}
          </div>

          {/* Right CTA Buttons */}
          <div className="ml-auto flex items-center gap-4 flex-shrink-0">
            <a
              href="https://api.subfrost.io/docs"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("api_docs_click", { event_category: "navigation", event_label: "sticky_nav" })}
              className="hidden sm:inline-flex items-center text-sm font-semibold text-[color:var(--sf-text)] hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            >
              API Docs
            </a>
            <a
              href="https://api.subfrost.io"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("api_login_click", { event_category: "navigation", event_label: "sticky_nav" })}
              className="hidden sm:inline-flex items-center text-sm font-semibold text-[color:var(--sf-text)] hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            >
              API Login
            </a>
            {/* TODO: remove disabled wrapper when app is ready to launch */}
            <HoverCard openDelay={100} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className="cursor-not-allowed">
                  <a
                    href="https://app.subfrost.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled="true"
                    tabIndex={-1}
                    onClick={(e) => e.preventDefault()}
                    className="flex justify-center px-5 py-2 rounded-md bg-white text-[#284372] hover:bg-[#f0f7ff] transition-colors font-bold text-xs md:text-sm shadow-md whitespace-nowrap pointer-events-none select-none"
                  >
                    LAUNCH APP
                  </a>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-auto px-3 py-1.5" align="end">
                <p className="text-sm font-bold text-[#284372]">Coming Soon!</p>
              </HoverCardContent>
            </HoverCard>
          </div>
        </div>
      </div>
    </nav>
  )
}
