/**
 * @file components/StickyNav.tsx
 * @description Sticky navigation component that appears in the top right corner after the hero section is scrolled out of view.
 * Provides quick navigation links to the 5 main sections of the page.
 */
"use client"

import { useEffect, useState } from "react"

const sections = [
  { id: "native-assets", label: "NATIVE ASSETS" },
  { id: "yield-products", label: "YIELD PRODUCTS" },
  { id: "subfrost-app", label: "SUBFROST APP" },
  { id: "yield-flow", label: "YIELD FLOW" },
  { id: "team-partnerships", label: "TEAM & PARTNERS" },
]

export default function StickyNav() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      // Show navigation when viewport height is scrolled (hero section is out of view)
      const heroHeight = window.innerHeight
      setIsVisible(window.scrollY > heroHeight)
    }

    window.addEventListener("scroll", handleScroll)
    handleScroll() // Check initial position
    
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
      className={`hidden fixed top-4 right-4 md:right-8 z-40 flex flex-col gap-2 items-end transition-opacity duration-100 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => scrollToSection(section.id)}
          className="text-2xs sm:text-xs md:text-sm text-gray-400 font-bold hover:opacity-80 transition-opacity"
        >
          {section.label}
        </button>
      ))}
    </nav>
  )
}
