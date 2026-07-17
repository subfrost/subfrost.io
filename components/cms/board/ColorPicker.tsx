"use client"

import { X } from "lucide-react"
import { TASK_COLORS } from "@/lib/tasks/types"

export function ColorPicker({ selected, onChange, disabled }: {
  selected: string
  onChange: (hex: string) => void
  disabled?: boolean
}) {
  const ring = (active: boolean) => (active ? "ring-2 ring-[color:var(--ed-ink)] ring-offset-2 ring-offset-[color:var(--ed-canvas)]" : "")
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange("")}
        disabled={disabled}
        title="No color"
        className={`flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] text-[color:var(--ed-muted)] disabled:opacity-50 ${ring(!selected)}`}
      >
        <X size={12} />
      </button>
      {TASK_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          onClick={() => onChange(c.hex)}
          disabled={disabled}
          title={c.name}
          aria-label={c.name}
          className={`h-6 w-6 rounded-full disabled:opacity-50 ${ring(selected.toLowerCase() === c.hex.toLowerCase())}`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  )
}
