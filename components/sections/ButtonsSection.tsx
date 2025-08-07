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
              `px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 md:py-3 text-2xs sm:text-xs md:text-base lg:text-base rounded-md text-center uppercase font-bold snow-button`,
            )}
          >
            READ DOCS
          </a>

          <button
            onClick={openContactModal}
            className={cn(`px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 md:py-3 text-2xs sm:text-xs md:text-base lg:text-base rounded-md uppercase font-bold snow-button`)}
          >
            CONTACT US
          </button>
        </div>
      </div>
    </div>
  )
}

export default ButtonsSection
