"use client"

import type React from "react"
import { useTranslation } from "@/hooks/useTranslation"

const BottomAnimatedSubtitle: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="subtitle-container h-6 md:h-7.5 lg:h-9 w-full text-center">
      <div className="text-sm md:text-sm text-[#284372] font-bold">
        {t("hero.subtitle")}
      </div>
    </div>
  )
}

export default BottomAnimatedSubtitle
