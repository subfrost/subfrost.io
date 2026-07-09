import { describe, it, expect } from "vitest"
import { parseCardParams, opReturnCardUrl, CARD_DEFAULTS } from "@/lib/marketing/opreturn-card"

const parse = (q: string) => parseCardParams(new URLSearchParams(q))

describe("parseCardParams", () => {
  it("fills defaults when params are missing", () => {
    expect(parse("")).toEqual(CARD_DEFAULTS)
  })

  it("accepts a valid combination", () => {
    expect(parse("metric=alkanesTxShare&window=full&template=compare&theme=light")).toEqual({
      metric: "alkanesTxShare",
      window: "full",
      template: "compare",
      theme: "light",
    })
  })

  it("rejects an unknown metric", () => {
    expect(parse("metric=totally-made-up")).toBeNull()
  })

  it("rejects an unknown window / template / theme", () => {
    expect(parse("window=avg9999")).toBeNull()
    expect(parse("template=fancy")).toBeNull()
    expect(parse("theme=neon")).toBeNull()
  })
})

describe("opReturnCardUrl", () => {
  it("builds a hero card url with the metric", () => {
    const u = opReturnCardUrl({ metric: "alkanesOfOpReturnShare", template: "hero", window: "avg7" })
    expect(u).toContain("/metrics/card/opreturn?")
    expect(u).toContain("template=hero")
    expect(u).toContain("metric=alkanesOfOpReturnShare")
    expect(u).toContain("window=avg7")
    expect(u).toContain("theme=dark")
  })

  it("omits the metric for compare cards", () => {
    const u = opReturnCardUrl({ template: "compare", window: "full" })
    expect(u).toContain("template=compare")
    expect(u).not.toContain("metric=")
    // every generated url round-trips through the validator
    expect(parse(u.split("?")[1])).not.toBeNull()
  })
})
