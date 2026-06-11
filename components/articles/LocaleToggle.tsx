"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

// Switches the reading language via ?lang=, only offering locales the article
// actually has.
export function LocaleToggle({ available, current }: { available: ("en" | "zh")[]; current: "en" | "zh" }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  if (available.length < 2) return null

  const label: Record<string, string> = { en: "EN", zh: "中文" }
  function go(loc: string) {
    const p = new URLSearchParams(params.toString())
    p.set("lang", loc)
    router.push(`${pathname}?${p.toString()}`)
  }
  return (
    <div className="inline-flex rounded-full border border-zinc-300 p-0.5 text-sm">
      {available.map((loc) => (
        <button key={loc} onClick={() => go(loc)}
          className={`rounded-full px-3 py-1 ${current === loc ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"}`}>
          {label[loc]}
        </button>
      ))}
    </div>
  )
}
