"use client"

import type React from "react"
import { cn } from "@/lib/utils"


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
            href="https://docs.subfrost.io/"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              `px-3 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 md:py-2.5 lg:py-3 rounded-md text-center uppercase font-bold snow-button text-2xs sm:text-xs md:text-base lg:text-base`,
            )}
          >
            READ DOCS
          </a>

          <button
            onClick={openContactModal}
            className={cn(`px-3 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 md:py-2.5 lg:py-3 text-2xs sm:text-xs md:text-base lg:text-base rounded-md uppercase font-bold snow-button`)}
          >
            CONTACT US
          </button>
        </div>
      </div>
    </div>
  )
}

export default ButtonsSection
