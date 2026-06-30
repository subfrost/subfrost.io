import { describe, it, expect } from "vitest"
import { CHANNEL_META, channelLabel } from "@/components/cms/marketing/pushChannel"

describe("channel meta", () => {
  it("has an entry for every channel", () => {
    for (const c of ["ARTICLE", "X", "EMAIL", "STAT_CARD", "OTHER"] as const) {
      expect(CHANNEL_META[c]).toBeTruthy()
      expect(typeof CHANNEL_META[c].dot).toBe("string")
    }
  })
  it("labels channels for display", () => {
    expect(channelLabel("X")).toBe("X / Twitter")
    expect(channelLabel("STAT_CARD")).toBe("Stat-card")
  })
})
