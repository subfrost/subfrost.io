import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { EcosystemAdmin } from "@/components/cms/ecosystem/EcosystemAdmin"
import { saveEcosystemProject } from "@/actions/ecosystem/projects"

vi.mock("@/actions/ecosystem/projects", () => ({
  saveEcosystemProject: vi.fn(),
  deleteEcosystemProject: vi.fn(),
  setFeaturedBandEnabled: vi.fn(),
  translateEcosystemDescription: vi.fn(),
}))
// next/navigation is mocked globally in tests/setup.ts.

beforeEach(() => cleanup())

describe("EcosystemAdmin — kind & alkaneId", () => {
  it("submits the selected kind and alkaneId on save", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "e1" })
    const { getByText, getByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Name"), { target: { value: "DIESEL" } })
    fireEvent.change(getByLabelText("Website URL"), { target: { value: "https://ordiscan.com/alkane/DIESEL/2:0" } })
    fireEvent.change(getByLabelText("Kind"), { target: { value: "Contract" } })
    fireEvent.change(getByLabelText("Alkane ID"), { target: { value: "2:0" } })
    fireEvent.click(getByText("Create project"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({ kind: "Contract", alkaneId: "2:0" })
  })
})
