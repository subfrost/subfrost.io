import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { EcosystemAdmin } from "@/components/cms/ecosystem/EcosystemAdmin"
import { saveEcosystemProject, translateEcosystemProfile } from "@/actions/ecosystem/projects"

vi.mock("@/actions/ecosystem/projects", () => ({
  saveEcosystemProject: vi.fn(),
  deleteEcosystemProject: vi.fn(),
  setFeaturedBandEnabled: vi.fn(),
  translateEcosystemDescription: vi.fn(),
  translateEcosystemProfile: vi.fn(),
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

describe("EcosystemAdmin — profile & contracts", () => {
  it("submits profile markdown and contract rows on save", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "e1" })
    const { getByText, getByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Name"), { target: { value: "Arbuzino" } })
    fireEvent.change(getByLabelText("Website URL"), { target: { value: "https://arbuzino.com" } })
    fireEvent.change(getByLabelText("Profile (EN)"), { target: { value: "# Body" } })
    fireEvent.click(getByText("Add contract"))
    fireEvent.change(getByLabelText("Contract 1 label"), { target: { value: "Fireball" } })
    fireEvent.change(getByLabelText("Contract 1 alkane ID"), { target: { value: "4:257" } })
    fireEvent.click(getByText("Create project"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({
      profileEn: "# Body",
      contracts: [{ label: "Fireball", alkaneId: "4:257" }],
    })
  })

  it("toggles the EN profile preview", async () => {
    const { getByText, getByLabelText, queryByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Profile (EN)"), { target: { value: "## Hello" } })
    fireEvent.click(getByText("Preview EN"))
    expect(queryByLabelText("Profile (EN)")).toBeNull() // textarea escondida no preview
    expect(getByText("Hello")).toBeInTheDocument()       // markdown renderizado
    fireEvent.click(getByText("Edit EN"))
    expect(getByLabelText("Profile (EN)")).toBeInTheDocument()
  })
})

describe("EcosystemAdmin — translate profile", () => {
  it("fills Profile (ZH) from the action result and disables while empty", async () => {
    vi.mocked(translateEcosystemProfile).mockResolvedValue({ ok: true, zh: "## 中文正文" })
    const { getByText, getByLabelText, getByRole } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    const btn = getByRole("button", { name: "Translate profile EN→ZH" })
    expect(btn).toBeDisabled() // profileEn vazio
    fireEvent.change(getByLabelText("Profile (EN)"), { target: { value: "## Products" } })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    await waitFor(() => expect(translateEcosystemProfile).toHaveBeenCalledWith("## Products"))
    await waitFor(() => expect(getByLabelText("Profile (ZH)")).toHaveValue("## 中文正文"))
  })
})

describe("EcosystemAdmin — hero mosaic toggle", () => {
  it("submits inMosaic when the form checkbox is ticked", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "e1" })
    const { getByText, getByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Name"), { target: { value: "Pizza.fun" } })
    fireEvent.change(getByLabelText("Website URL"), { target: { value: "https://pizza.fun" } })
    fireEvent.click(getByLabelText("Show in hero mosaic"))
    fireEvent.click(getByText("Create project"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({ inMosaic: true })
  })

  it("submits showMarketStats when the form checkbox is ticked", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "e1" })
    const { getByText, getByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Name"), { target: { value: "Pizza.fun" } })
    fireEvent.change(getByLabelText("Website URL"), { target: { value: "https://pizza.fun" } })
    fireEvent.click(getByLabelText("Show market stats"))
    fireEvent.click(getByText("Create project"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({ showMarketStats: true })
  })

  it("per-row toggle saves inMosaic for an existing project", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "p1" })
    const proj = {
      id: "p1", slug: "surtur", name: "Surtur", logoUrl: null, bannerUrl: null,
      category: "Social", status: "Live", kind: "App", alkaneId: null,
      url: "https://surtur.io", xUrl: null, docsUrl: null,
      descriptionEn: "d", descriptionZh: "", featured: false, inMosaic: false,
      showMarketStats: false,
      sortOrder: 0, published: true, profileEn: "", profileZh: "",
      contracts: [], createdAt: "", updatedAt: "",
    }
    const { getByLabelText } = render(
      <EcosystemAdmin projects={[proj]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByLabelText("In mosaic: Surtur"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({ inMosaic: true })
  })
})
