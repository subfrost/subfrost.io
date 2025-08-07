"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import FrostBackdrop from "@/components/FrostBackdrop"
import BottomAnimatedSubtitle from "@/components/BottomAnimatedSubtitle"
import Footer from "@/components/Footer"
import GlobalStyles from "@/components/GlobalStyles"
import DevelopmentModal from "@/components/DevelopmentModal"
import SocialButtons from "@/components/SocialButtons"

export default function Page() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleEnterApp = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleConfirmAndNavigate = () => {
    window.location.href = "https://app.subfrost.io"
  }

  return (
    <main className="relative overflow-x-hidden">
      <GlobalStyles />

      {/* Hero Section - Keep FrostBackdrop */}
      <section className="relative flex min-h-screen flex-col items-center overflow-hidden bg-gradient-to-b from-blue-200 to-blue-50 snap-start">
        <FrostBackdrop />
        <SocialButtons />

        {/* Updated positioning to place the bottom of the title just above center */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-4xl px-4 h-screen">
          {/* Content container with adjusted positioning */}
          <div className="flex flex-col items-center w-full absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            {/* SUBFROST title - changed B to ₿ */}
            <div className="w-full px-2 sm:px-0">
              <h1
                className={cn(
                  "text-[4rem] sm:text-[4.56rem] md:text-[6.08rem] lg:text-[9.11rem] text-white tracking-normal font-bold uppercase text-center snow-title",
                )}
              >
                SU₿FROST
              </h1>
            </div>

            {/* Top subtitle below the title */}
            <div className="mt-1 mb-6">
              <BottomAnimatedSubtitle />
            </div>
          </div>
        </div>

        <Footer />
      </section>

      <DevelopmentModal isOpen={isModalOpen} onClose={handleCloseModal} onConfirm={handleConfirmAndNavigate} />
    </main>
  )
}
