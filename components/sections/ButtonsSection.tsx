"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import { BUTTON_WIDTH } from "@/app/page"

interface ButtonsSectionProps {
  openContactModal: () => void
}

const ButtonsSection: React.FC<ButtonsSectionProps> = ({ openContactModal }) => {
  return (
    <div className="space-y-8 animate-fade-in flex flex-col items-center justify-center">
      {/* Removed the GET INVOLVED headline */}

      <div className="flex flex-col items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-6">
          <a
            href="https://drive.google.com/file/d/1rgDUaGILrsir4tiMgQXytNoUvQq8ySFQ/view"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              `px-6 py-2.5 text-sm sm:text-base md:text-lg lg:text-xl rounded-md text-center ${BUTTON_WIDTH} uppercase font-bold snow-button`,
            )}
          >
            READ WHITEPAPER
          </a>

          <button
            onClick={openContactModal}
            className={cn(`px-6 py-2.5 text-sm sm:text-base md:text-lg lg:text-xl rounded-md ${BUTTON_WIDTH} uppercase font-bold snow-button`)}
          >
            CONTACT US
          </button>
        </div>
      </div>
    </div>
  )
}

export default ButtonsSection
