"use client"

import type React from "react"
import { trackEvent } from "@/lib/analytics"
import { useTranslation } from "@/hooks/useTranslation"

const ActionButtons: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-3 mt-6">
      <a
        href="https://app.subfrost.io/"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => { trackEvent("launch_app_click", { event_category: "cta", event_label: "hero_action_buttons" }); }}
        className="group relative flex justify-center items-center gap-2 px-8 py-3.5 w-52 md:w-60 rounded-lg bg-white text-[#284372] hover:bg-[#f0f7ff] shadow-[0_4px_20px_rgba(40,67,114,0.25)] hover:shadow-[0_6px_28px_rgba(40,67,114,0.4)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:scale-[1.03] focus:outline-none font-extrabold uppercase tracking-widest text-base md:text-base whitespace-nowrap"
      >
        <span className="relative z-10">{t("hero.launchApp")}</span>
        <svg className="relative z-10 w-4 h-4 transition-transform duration-[400ms] ease-[cubic-bezier(0,0,0,1)] group-hover:translate-x-1 group-hover:transition-none" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </a>
    </div>
  )
}

export default ActionButtons
