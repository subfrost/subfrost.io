import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { ProfileForm, type ProfileInitial } from "@/components/cms/ProfileForm"

vi.mock("@/actions/cms/users", () => ({
  updateProfile: vi.fn(),
}))
// next/navigation is mocked globally in tests/setup.ts.

beforeEach(() => cleanup())
afterEach(() => vi.unstubAllGlobals())

const initial: ProfileInitial = {
  id: "u1",
  email: "ann@subfrost.io",
  name: "Ann",
  bio: "",
  twitter: "",
  avatarUrl: "",
  status: "",
}

function pickAvatar() {
  const utils = render(<ProfileForm initial={initial} canEditBio />)
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(["png-bytes"], "avatar.png", { type: "image/png" })
  fireEvent.change(input, { target: { files: [file] } })
  return utils
}

describe("ProfileForm — avatar upload failure handling", () => {
  // Regression for the /admin upload fragility: res.json() with no guard against a
  // gateway's non-JSON (500/502 HTML) body threw, and with no finally the button was
  // stranded on "Uploading…" forever with nothing surfaced to the user.
  it("shows an inline error and restores the button when the server answers non-JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<html>Internal Server Error</html>", {
        status: 500,
        headers: { "content-type": "text/html" },
      }),
    ))
    const { getByText, getByRole } = pickAvatar()
    await waitFor(() => expect(getByRole("alert").textContent).toMatch(/upload failed/i))
    expect(getByText("Change avatar")).toBeTruthy()
  })

  it("shows an inline error and restores the button when the request itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    const { getByText, getByRole } = pickAvatar()
    await waitFor(() => expect(getByRole("alert").textContent).toMatch(/upload failed/i))
    expect(getByText("Change avatar")).toBeTruthy()
  })

  it("surfaces the server-provided message on a JSON error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Image exceeds 8MB limit" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ))
    const { getByRole } = pickAvatar()
    await waitFor(() => expect(getByRole("alert").textContent).toMatch(/Image exceeds 8MB limit/))
  })

  it("previews the uploaded avatar on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://storage.googleapis.com/subfrost-cms/avatars/a.png" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ))
    const { container } = pickAvatar()
    await waitFor(() => {
      const img = container.querySelector('img[src="https://storage.googleapis.com/subfrost-cms/avatars/a.png"]')
      expect(img).toBeTruthy()
    })
  })
})
