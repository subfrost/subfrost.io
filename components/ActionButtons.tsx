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
        className="group flex justify-center items-center gap-2 px-5 py-2 rounded-md bg-white text-[#284372] hover:bg-[#f0f7ff] transition-colors font-bold text-sm shadow-md whitespace-nowrap"
      >
        {t("hero.launchApp")}
      </a>
    </div>
  )
}

export default ActionButtons
