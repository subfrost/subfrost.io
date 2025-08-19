"use client"

import type React from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const ActionButtons: React.FC = () => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-4 mt-4">
      <a
        href="https://docs.subfrost.io/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex justify-center px-6 py-2 w-36 sm:w-40 md:w-48 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-2xs sm:text-xs md:text-sm lg:text-base"
      >
        OFFICIAL DOCS
      </a>
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex justify-center px-6 py-2 w-36 sm:w-40 md:w-48 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-2xs sm:text-xs md:text-sm lg:text-base">
            CONTACT US
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto">
          <div className="flex flex-col gap-2 text-sm">
            <a
              href="mailto:inquiries@subfrost.io"
              className="text-[#284372] hover:underline"
            >
              Email Us
            </a>
            <a
              href="https://x.com/SUBFROSTio/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#284372] hover:underline"
            >
              Message us on X
            </a>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default ActionButtons