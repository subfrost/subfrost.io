import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { PushMetricsFields } from "@/components/cms/marketing/PushMetricsFields"
import type { PushMetrics } from "@/lib/cms/marketing-analytics"

beforeEach(() => cleanup())
afterEach(() => vi.unstubAllGlobals())

const emptyMetrics: PushMetrics = { impressions: null, likes: null, reposts: null, clicks: null }

function pickScreenshot(onScreenshot = vi.fn()) {
  const utils = render(
    <PushMetricsFields
      metrics={emptyMetrics}
      screenshotUrl={null}
      onMetrics={vi.fn()}
      onScreenshot={onScreenshot}
    />,
  )
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(["png-bytes"], "print.png", { type: "image/png" })
  fireEvent.change(input, { target: { files: [file] } })
  return { ...utils, onScreenshot }
}

describe("PushMetricsFields — screenshot upload failure handling", () => {
  it("shows a clean inline alert (not a raw JSON-parse error) when the server answers non-JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<html>Bad Gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    ))
    const { getByRole, queryByText } = pickScreenshot()
    await waitFor(() => expect(getByRole("alert").textContent).toMatch(/upload failed/i))
    expect(getByRole("alert").textContent).not.toMatch(/JSON|token/i)
    expect(queryByText("Uploading…")).toBeNull()
  })

  it("surfaces the server-provided message on a JSON error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Image exceeds 8MB limit" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ))
    const { getByRole } = pickScreenshot()
    await waitFor(() => expect(getByRole("alert").textContent).toMatch(/Image exceeds 8MB limit/))
  })

  it("reports the uploaded screenshot URL on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://storage.googleapis.com/subfrost-cms/inline/p.png" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ))
    const { onScreenshot } = pickScreenshot()
    await waitFor(() =>
      expect(onScreenshot).toHaveBeenCalledWith("https://storage.googleapis.com/subfrost-cms/inline/p.png"),
    )
  })
})
