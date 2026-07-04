import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { EcosystemAdmin } from "@/components/cms/ecosystem/EcosystemAdmin"

vi.mock("@/actions/ecosystem/projects", () => ({
  saveEcosystemProject: vi.fn(),
  deleteEcosystemProject: vi.fn(),
  setFeaturedBandEnabled: vi.fn(),
  translateEcosystemDescription: vi.fn(),
}))
// next/navigation is mocked globally in tests/setup.ts.

beforeEach(() => cleanup())
afterEach(() => vi.unstubAllGlobals())

function openFormAndPickLogo() {
  const utils = render(<EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />)
  fireEvent.click(utils.getByText("New project"))
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(["png-bytes"], "logo.png", { type: "image/png" })
  fireEvent.change(input, { target: { files: [file] } })
  return utils
}

describe("EcosystemAdmin — logo upload failure handling", () => {
  // The prod incident: the upload route died at module load (jsdom/ERR_REQUIRE_ESM
  // on the runner's Node 20.13), so every POST answered 500 with an HTML body.
  // res.json() then threw and the button was stuck on "Uploading…" forever.
  it("shows an inline error and restores the button when the server answers non-JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<html>Internal Server Error</html>", {
        status: 500,
        headers: { "content-type": "text/html" },
      }),
    ))
    const { getByText, getByRole } = openFormAndPickLogo()
    await waitFor(() => expect(getByRole("alert").textContent).toMatch(/upload failed/i))
    expect(getByText("Upload logo")).toBeTruthy()
  })

  it("shows an inline error and restores the button when the request itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    const { getByText, getByRole } = openFormAndPickLogo()
    await waitFor(() => expect(getByRole("alert").textContent).toMatch(/upload failed/i))
    expect(getByText("Upload logo")).toBeTruthy()
  })

  it("surfaces the server-provided message on a JSON error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Image exceeds 8MB limit" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ))
    const { getByText } = openFormAndPickLogo()
    await waitFor(() => expect(getByText(/Image exceeds 8MB limit/)).toBeTruthy())
    expect(getByText("Upload logo")).toBeTruthy()
  })

  it("previews the uploaded logo on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://storage.googleapis.com/subfrost-cms/ecosystem/logo.png" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ))
    const { container, getByText } = openFormAndPickLogo()
    await waitFor(() => {
      const img = container.querySelector('img[src="https://storage.googleapis.com/subfrost-cms/ecosystem/logo.png"]')
      expect(img).toBeTruthy()
    })
    expect(getByText("Upload logo")).toBeTruthy()
  })
})
