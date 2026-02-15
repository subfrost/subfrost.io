"use client"

// components/stream/LanguageToggle.tsx
// Compact language toggle for switching caption display modes.
//
// Design Decisions:
// - Uses the shadcn Tabs component for consistent styling with the rest of the UI.
// - Maps CaptionLanguage values to short labels (EN, CN, Both) for compact display.
// - The onChange callback fires on tab value change for controlled usage.
//
// Journal:
// - 2026-02-14 (Claude): Created caption language toggle component.

import { cn } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CaptionLanguage } from "@/lib/stream-types"

interface LanguageToggleProps {
  value: CaptionLanguage
  onChange: (value: CaptionLanguage) => void
  className?: string
}

export function LanguageToggle({ value, onChange, className }: LanguageToggleProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as CaptionLanguage)}
      className={cn("w-auto", className)}
    >
      <TabsList className="h-8 p-0.5">
        <TabsTrigger value="original" className="h-7 px-2.5 text-xs">
          EN
        </TabsTrigger>
        <TabsTrigger value="translated" className="h-7 px-2.5 text-xs">
          CN
        </TabsTrigger>
        <TabsTrigger value="both" className="h-7 px-2.5 text-xs">
          Both
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
