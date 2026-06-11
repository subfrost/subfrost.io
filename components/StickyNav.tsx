"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { trackEvent } from "@/lib/analytics"
import LanguageToggle from "@/components/LanguageToggle"
import StableText from "@/components/StableText"

const NAV_HEIGHT = 58

export default function StickyNav() {
  const [isVisible, setIsVisible] = useState(false)

  const sections = [
    { id: "native-assets", labelKey: "nav.assets", offset: NAV_HEIGHT + 16 },
    { id: "subfrost-app", labelKey: "nav.app", offset: NAV_HEIGHT + 16 },
    { id: "team-partnerships", labelKey: "nav.teamPartners", offset: 0 },
  ]

  useEffect(() => {
    const hero = document.querySelector("main > section") as HTMLElement | null
    if (!hero) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(!entry.isIntersecting),
      { threshold: 0 },
    )

    observer.observe(hero)
    return () => observer.disconnect()
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
        <div className="px-4 h-[58px] flex items-center justify-between gap-4">
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
                <StableText textKey={section.labelKey} />
              </button>
            ))}
          </div>

          {/* Right CTA Buttons */}
          <div className="ml-auto flex items-center gap-4 flex-shrink-0">
            <a
              href="https://docs.subfrost.io/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("docs_click", { event_category: "navigation", event_label: "sticky_nav" })}
              className="hidden sm:inline-flex items-center text-sm font-semibold text-[color:var(--sf-text)] hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            >
              <StableText textKey="nav.docs" />
            </a>
            <a
              href="https://api.subfrost.io"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("api_login_click", { event_category: "navigation", event_label: "sticky_nav" })}
              className="hidden sm:inline-flex items-center text-sm font-semibold text-[color:var(--sf-text)] hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            >
              <StableText textKey="nav.apiLogin" />
            </a>
            <LanguageToggle variant="dark" />
            <a
              href="https://app.subfrost.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-center px-5 py-2 rounded-md bg-white text-[#284372] hover:bg-[#f0f7ff] transition-colors font-bold text-xs md:text-sm shadow-md whitespace-nowrap"
            >
              <StableText textKey="hero.launchApp" />
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}
