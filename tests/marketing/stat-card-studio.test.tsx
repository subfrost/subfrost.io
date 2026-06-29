import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("@/actions/marketing/opreturn", () => ({ syncOpReturnAction: vi.fn().mockResolvedValue({ ok: true, value: { fetched: 1, upserted: 1, latestDate: "2026-06-28" } }) }))

import { StatCardStudio } from "@/components/cms/marketing/StatCardStudio"

beforeEach(() => cleanup())

it("renders a live preview whose src reflects the chosen metric and window", () => {
  const { getByLabelText, getByAltText } = render(<StatCardStudio meta={{ count: 183, latestDate: "2026-06-28", latestUpdatedAt: null }} />)
  fireEvent.change(getByLabelText("Metric"), { target: { value: "alkanesBytesShare" } })
  fireEvent.change(getByLabelText("Window"), { target: { value: "avg60" } })
  const img = getByAltText("Card preview") as HTMLImageElement
  expect(img.src).toContain("metric=alkanesBytesShare")
  expect(img.src).toContain("window=avg60")
})

it("shows an empty-state hint when no data has been synced", () => {
  const { getByText } = render(<StatCardStudio meta={{ count: 0, latestDate: null, latestUpdatedAt: null }} />)
  expect(getByText(/Sync now/i)).toBeTruthy()
})
