"use client"

import type React from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ActionButtonsProps {
  onMetricsClick: () => void;
  showMetrics: boolean;
  onPartnershipsClick: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ onMetricsClick, showMetrics, onPartnershipsClick }) => {
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
      <button
        onClick={onPartnershipsClick}
        className="flex justify-center px-6 py-2 w-36 sm:w-40 md:w-48 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-2xs sm:text-xs md:text-sm"
      >
        PARTNERSHIPS
      </button>
      <button
        onClick={onMetricsClick}
        className="flex md:hidden justify-center px-6 py-2 w-36 sm:w-40 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-2xs sm:text-xs"
      >
        {showMetrics ? "CLOSE METRICS" : "METRICS"}
      </button>
    </div>
  )
}

export default ActionButtons