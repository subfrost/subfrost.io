/**
 * @file components/InfoSection.tsx
 * @description A generic container for content sections with a consistent style.
 * It's designed to fade in as the user scrolls down.
 *
 * UI/UX Decisions:
 * - Fade-in on scroll: The section uses the Intersection Observer API to detect when it enters the viewport. This triggers a fade-in effect, creating a smooth, progressive disclosure of content that feels modern and engaging.
 * - Componentization: This entire section is a self-contained component, making the main page component cleaner and easier to manage. It now accepts children to render any content.
 * - Dark Theme Update: The background has been changed to a custom dark blue (`#121A2C`), and text colors are adjusted in `app/page.tsx`. The `FrostBackdrop` animation is set to `animationType="shift"` to make snowflakes shift around, fitting the "Subfrost" theme.
 * - Scrollbar fix: The section is wrapped in a non-scrolling container with `overflow-hidden` to contain the transformed backdrop. An inner div is used to handle content scrolling (`overflow-y-auto`), preventing the backdrop's animation from creating a second scrollbar.
 */
"use client"

import React, { forwardRef } from "react"
import { cn } from "@/lib/utils"
import FrostBackdrop from "./FrostBackdrop"

interface InfoSectionProps {
  children: React.ReactNode
  isFlipped?: boolean
}

const InfoSection = forwardRef<HTMLElement, InfoSectionProps>(({ children, isFlipped = false }, ref) => {
  return (
    <section
      ref={ref}
      className={cn(
        "relative px-4",
        "bg-[#121A2C]", // Solid dark background - always visible
        "text-gray-300",
        "py-20 md:py-28",
        "overflow-hidden",
        "min-h-screen", // Ensure minimum height
      )}
    >
      {/* Snowflakes backdrop - falling animation throughout the section */}
      <FrostBackdrop animationType="fall" invisible={false} reducedOpacity={true} longFall={true} />

      {/* Content container - always visible */}
      <div className="relative z-10">
        <div className="max-w-7xl mx-auto">{children}</div>
      </div>
    </section>
  )
})

InfoSection.displayName = "InfoSection"
export default InfoSection