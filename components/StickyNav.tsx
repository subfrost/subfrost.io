"use client"

import { useEffect, useState } from "react"
import { trackEvent } from "@/lib/analytics"

const sections = [
  { id: "native-assets", label: "Assets" },
  { id: "subfrost-app", label: "App" },
  { id: "yield-flow", label: "Yield Flow" },
  { id: "team-partnerships", label: "Team & Partners" },
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

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
      }`}
    >
      <div className="bg-[#0a1020]/95 backdrop-blur-md border-b border-white/10 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <button
            onClick={() => { trackEvent("nav_logo_click", { event_category: "navigation", event_label: "sticky_nav" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="text-white font-bold text-sm md:text-base tracking-widest snow-title-no-filter flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            SU₿FROST
          </button>

          {/* Center Nav Links */}
          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => { trackEvent("nav_section_click", { event_category: "navigation", event_label: section.id }); scrollToSection(section.id); }}
                className="text-xs text-gray-400 font-semibold hover:text-white transition-colors uppercase tracking-wider whitespace-nowrap"
              >
                {section.label}
              </button>
            ))}
          </div>

          {/* Right CTA Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="https://api.subfrost.io/docs"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("api_docs_click", { event_category: "navigation", event_label: "sticky_nav" })}
              className="hidden sm:flex items-center px-4 py-1.5 text-xs font-semibold text-gray-300 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-all uppercase tracking-wider whitespace-nowrap"
            >
              API Docs
            </a>
            <a
              href="https://api.subfrost.io"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("api_login_click", { event_category: "navigation", event_label: "sticky_nav" })}
              className="hidden sm:flex items-center px-4 py-1.5 text-xs font-semibold text-gray-300 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-all uppercase tracking-wider whitespace-nowrap"
            >
              API Login
            </a>
            <a
              href="https://app.subfrost.io/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("launch_app_click", { event_category: "cta", event_label: "sticky_nav" })}
              className="flex items-center px-5 py-2 text-xs font-bold bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-md transition-all uppercase tracking-wider shadow-lg shadow-blue-900/30 whitespace-nowrap"
            >
              Launch App
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}
