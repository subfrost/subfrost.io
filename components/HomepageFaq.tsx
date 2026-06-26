"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"

export function HomepageFaq({ items }: { items: { question: string; answer: string }[] }) {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <div>
      {items.map((item, index) => {
        const isOpen = openIndex === index

        return (
          <div key={item.question} className="border-t last:border-b" style={{ borderColor: "var(--ed-hair)" }}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
              onMouseDown={(event) => event.preventDefault()}
              className="flex w-full cursor-pointer items-start justify-between gap-5 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
              aria-expanded={isOpen}
            >
              <span className="font-display text-[19px] font-normal leading-[1.3] sm:text-[22px]" style={{ color: "var(--ed-ink)" }}>
                {item.question}
              </span>
              <ChevronRight
                className={`mt-1 h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? "rotate-90" : ""}`}
                strokeWidth={1.8}
                style={{ color: "var(--ed-muted)" }}
              />
            </button>
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="max-w-[760px] pb-6 text-[16px] leading-[1.55]" style={{ color: "var(--ed-muted)" }}>
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
