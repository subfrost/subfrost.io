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

export default function Page() {
  const [showMetrics, setShowMetrics] = useState(false)
  const [isPartnershipsModalOpen, setIsPartnershipsModalOpen] = useState(false)

  const toggleMetrics = () => {
    setShowMetrics(!showMetrics)
  }

  const handleOpenPartnershipsModal = () => {
    setIsPartnershipsModalOpen(true)
  }

  const handleClosePartnershipsModal = () => {
    setIsPartnershipsModalOpen(false)
  }

  return (
    <main className={cn("relative", { "metrics-open": showMetrics })}>
      <GlobalStyles />
      <PartnershipsModal isOpen={isPartnershipsModalOpen} onClose={handleClosePartnershipsModal} />

      {/* Hero Section - Keep FrostBackdrop */}
      <section className="relative flex h-screen flex-col items-center overflow-hidden bg-gradient-to-b from-blue-200 to-blue-50">
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
              <ActionButtons onMetricsClick={toggleMetrics} showMetrics={showMetrics} onPartnershipsClick={handleOpenPartnershipsModal} />
              <div className="md:hidden">
                {showMetrics && <MetricsBoxes onPartnershipsClick={handleOpenPartnershipsModal} />}
              </div>
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
