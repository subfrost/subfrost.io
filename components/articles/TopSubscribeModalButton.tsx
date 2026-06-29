"use client"

import { SubscribePanel } from "./SubscribePanel"

export function TopSubscribeModalButton({ locale }: { locale: "en" | "zh" }) {
  return (
    <div className="w-full max-w-[280px] sm:w-[280px]">
      <SubscribePanel locale={locale} footer compact />
    </div>
  )
}
