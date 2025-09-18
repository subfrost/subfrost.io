"use client"

import type React from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface ActionButtonsProps {
  onMetricsClick: () => void;
  showMetrics: boolean;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ onMetricsClick, showMetrics }) => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-4 mt-4">
      <a
        href="https://docs.subfrost.io/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex justify-center px-6 py-2 w-36 sm:w-40 md:w-48 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-2xs sm:text-xs md:text-sm "
      >
        OFFICIAL DOCS
      </a>
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex justify-center px-6 py-2 w-36 sm:w-40 md:w-48 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-2xs sm:text-xs md:text-sm ">
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
      <button
        onClick={onMetricsClick}
        className="flex md:hidden items-center justify-between px-6 py-2 w-36 sm:w-40 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-2xs sm:text-xs"
      >
        <span className="flex-1 text-center">METRICS</span>
        <svg
          className={cn("w-4 h-4 transition-transform", {
            "rotate-180": showMetrics,
          })}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    </div>
  )
}

export default ActionButtons