"use client"

import type React from "react"
import { trackEvent } from "@/lib/analytics"

interface ActionButtonsProps {
  onMetricsClick: () => void;
  onVolumeChartsClick: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ onMetricsClick, onVolumeChartsClick }) => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-3 mt-6">
      <a
        href="https://app.subfrost.io/"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("launch_app_click", { event_category: "cta", event_label: "hero_action_buttons" })}
        className="flex justify-center items-center px-6 py-2.5 w-44 sm:w-48 md:w-52 rounded-md bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white shadow-lg shadow-blue-900/40 transition-all font-bold uppercase tracking-wide text-2xs sm:text-xs md:text-sm"
      >
        LAUNCH APP
      </a>
      <a
        href="https://docs.subfrost.io/"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("official_docs_click", { event_category: "cta", event_label: "hero_action_buttons" })}
        className="flex justify-center px-6 py-2.5 w-44 sm:w-48 md:w-52 rounded-md bg-white text-[#284372] hover:bg-[#f0f7ff] shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none font-bold uppercase tracking-wide text-2xs sm:text-xs md:text-sm"
      >
        OFFICIAL DOCS
      </a>
      <button
        onClick={() => { trackEvent("volume_charts_click", { event_category: "cta", event_label: "hero_action_buttons" }); onVolumeChartsClick(); }}
        className="flex justify-center px-2 py-2.5 w-44 sm:w-48 md:w-52 rounded-md bg-white text-[#284372] hover:bg-[#f0f7ff] shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none font-bold uppercase tracking-wide text-2xs sm:text-xs md:text-sm whitespace-nowrap"
      >
        VOLUME CHARTS
      </button>

      <button
        onClick={() => { trackEvent("metrics_modal_open", { event_category: "cta", event_label: "hero_action_buttons" }); onMetricsClick(); }}
        className="flex md:hidden justify-center px-6 py-2.5 w-44 sm:w-48 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-2xs sm:text-xs"
      >
        METRICS
      </button>
    </div>
  )
}

export default ActionButtons