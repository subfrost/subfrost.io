"use client"

import { PERSONAS, applyPersona, personaGrantable } from "@/lib/cms/iam/personas"

/** One-click persona presets shown above the PrivilegePicker. Clicking a persona
 *  additively merges its (implies-expanded, grantable-capped) privileges into the
 *  current selection. A persona is disabled when the actor can't grant all of it. */
export function PersonaQuickPick({
  value,
  onChange,
  grantable,
  disabled,
}: {
  value: string[]
  onChange: (codes: string[]) => void
  grantable: string[]
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Quick personas</div>
      <div className="flex flex-wrap gap-2">
        {PERSONAS.map((p) => {
          const ok = personaGrantable(p, grantable)
          return (
            <button
              key={p.key}
              type="button"
              title={p.description}
              disabled={disabled || !ok}
              onClick={() => onChange(applyPersona(value, p, grantable))}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 hover:border-sky-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden className="mr-1 text-zinc-500">+</span>
              <span>{p.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
