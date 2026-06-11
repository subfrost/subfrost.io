"use client"

import type React from "react"
import { trackEvent } from "@/lib/analytics"
import { useTranslation } from "@/hooks/useTranslation"

interface ActionButtonsProps {
  onVolumeChartsClick: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ onVolumeChartsClick }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-3 mt-6">
      <button
        onClick={() => { trackEvent("volume_charts_click", { event_category: "cta", event_label: "hero_action_buttons" }); onVolumeChartsClick(); }}
        className="flex justify-center px-2 py-2.5 w-44 md:w-48 rounded-md bg-white text-[#284372] hover:bg-[#f0f7ff] shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none font-bold uppercase tracking-wide text-sm md:text-sm whitespace-nowrap"
      >
        {t("hero.volumeCharts")}
      </button>
    </div>
  )
}

export default ActionButtons
