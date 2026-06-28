"use client"

import { useState } from "react"
import { SafesManager } from "@/components/cms/financials/SafesManager"
import { DesertersManager } from "@/components/cms/financials/DesertersManager"

type Tab = "instruments" | "deserters"

export function SafesTabs() {
  const [tab, setTab] = useState<Tab>("instruments")
  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-zinc-800">
        <TabButton active={tab === "instruments"} onClick={() => setTab("instruments")}>Instruments</TabButton>
        <TabButton active={tab === "deserters"} onClick={() => setTab("deserters")}>Deserter SAFEs</TabButton>
      </div>
      <div key={tab} className="duration-200 animate-in fade-in">
        {tab === "instruments" ? <SafesManager /> : <DesertersManager />}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex-1 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-4 ${
        active ? "border-sky-500 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  )
}
