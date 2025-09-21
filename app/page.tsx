/**
 * @file app/page.tsx
 * @description This is the main page of the application, featuring a hero section with a dynamic frost backdrop and responsive content.
 *
 * The hero section is designed to fill the viewport and prevent unintended scrolling on mobile devices. It uses `h-dvh` (dynamic viewport height) to ensure its height is strictly constrained to the visible area, accounting for mobile browser toolbars. The `overflow-hidden` class prevents content from spilling out.
 *
 * The page includes several key components:
 * - `FrostBackdrop`: A decorative background with animated snowflakes, positioned within the hero section to render behind its content.
 * - `SocialButtons`: A set of social media links with responsive positioning.
 * - `ActionButtons`: Primary user actions that adapt to different screen sizes.
 * - `MetricsBoxes`: A conditionally rendered section that, when visible, allows for vertical scrolling.
 * - `Footer`: A responsive footer that is fixed on mobile and absolute on larger screens.
 *
 * The `metrics-open` class is dynamically applied to the `main` element to enable `overflow-y: auto` when the metrics section is visible, allowing the user to scroll as needed.
 */
"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import FrostBackdrop from "@/components/FrostBackdrop"
import BottomAnimatedSubtitle from "@/components/BottomAnimatedSubtitle"
import Footer from "@/components/Footer"
import GlobalStyles from "@/components/GlobalStyles"
import SocialButtons from "@/components/SocialButtons"
import ActionButtons from "@/components/ActionButtons"
import MetricsBoxes from "@/components/MetricsBoxes"
import PartnershipsModal from "@/components/PartnershipsModal"
import CustomModal from "@/components/CustomModal"

export default function Page() {
  const [isPartnershipsModalOpen, setIsPartnershipsModalOpen] = useState(false)
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false)

  const handleOpenPartnershipsModal = () => {
    setIsPartnershipsModalOpen(true)
  }

  const handleOpenPartnershipsAndCloseMetrics = () => {
    handleCloseMetricsModal()
    handleOpenPartnershipsModal()
  }

  const handleClosePartnershipsModal = () => {
    setIsPartnershipsModalOpen(false)
  }

  const handleOpenMetricsModal = () => {
    setIsMetricsModalOpen(true)
  }

  const handleCloseMetricsModal = () => {
    setIsMetricsModalOpen(false)
  }

  return (
    <main className="relative">
      <GlobalStyles />
      <PartnershipsModal
        isOpen={isPartnershipsModalOpen}
        onClose={handleClosePartnershipsModal}
      />
      <div className="md:hidden">
        <CustomModal
          isOpen={isMetricsModalOpen}
          onClose={handleCloseMetricsModal}
          title="Metrics"
        >
          <MetricsBoxes onPartnershipsClick={handleOpenPartnershipsAndCloseMetrics} isModal={true} />
        </CustomModal>
      </div>

      {/* Hero Section */}
      <section className="relative flex h-dvh flex-col items-center overflow-hidden bg-gradient-to-b from-blue-200 to-blue-50">
        <FrostBackdrop />
        <SocialButtons />

        {/* Updated positioning to place the bottom of the title just above center */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-4xl px-4 h-screen">
          {/* Content container with adjusted positioning */}
          <div className="flex flex-col items-center w-full absolute top-[50%] left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            {/* SUBFROST title - changed B to ₿ */}
            <div className="w-full px-2 sm:px-0">
              <h1
                className={cn(
                  "text-[4rem] sm:text-[6rem] md:text-[7rem] lg:text-[9.11rem] text-white tracking-normal font-bold uppercase text-center snow-title",
                )}
              >
                SU₿FROST
              </h1>
            </div>

            {/* Top subtitle below the title */}
            <div className="mt-1 mb-6 flex flex-col items-center">
              <div className="flex justify-center w-full">
                <BottomAnimatedSubtitle />
              </div>
              <ActionButtons
                onMetricsClick={handleOpenMetricsModal}
                onPartnershipsClick={handleOpenPartnershipsModal}
              />
              <div className="hidden md:block">
                <MetricsBoxes onPartnershipsClick={handleOpenPartnershipsModal} />
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </section>
    </main>
  )
}
