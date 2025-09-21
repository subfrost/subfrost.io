/**
 * @file components/ActionButtons.tsx
 * @description This component renders the primary user actions, including buttons for documentation, partnerships, and metrics.
 *
 * The buttons are designed to be fully responsive. On mobile devices, they stack vertically (`flex-col`) to ensure they fit within the viewport, while on medium screens and larger (`md:`), they align horizontally (`md:flex-row`). The width of the buttons is also responsive, using `w-36` on the smallest screens, `sm:w-40` on small screens, and `md:w-48` on medium screens and up.
 *
 * The "METRICS" button is conditionally rendered and hidden on medium screens and larger (`md:hidden`), as it is expected to be part of a different layout on desktop. The component also manages the state for the "Partnerships" modal, which is triggered by the corresponding button.
 * 2025-09-20: Removed `showMetrics` prop and simplified the "METRICS" button to only trigger the modal.
 */
"use client"

import type React from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ActionButtonsProps {
  onMetricsClick: () => void;
  onPartnershipsClick: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ onMetricsClick, onPartnershipsClick }) => {
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
        METRICS
      </button>
    </div>
  )
}

export default ActionButtons