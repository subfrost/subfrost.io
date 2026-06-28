import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/tasks/board", () => ({
  createProductAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "p9" } }),
  updateProductAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  archiveProductAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
  updateInitiativeAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}))

import { ProductsClient } from "@/components/cms/board/ProductsClient"
import type { ProductView, InitiativeView } from "@/lib/tasks/types"
import { createProductAction, archiveProductAction, updateInitiativeAction } from "@/actions/tasks/board"

const product: ProductView = { id: "p1", name: "iOS", color: "#ffffff", archived: false, createdAt: new Date(), updatedAt: new Date() }
const init = (over: Partial<InitiativeView>): InitiativeView => ({
  id: "i1", name: "App Store Release", goal: "", color: "#38bdf8", status: "TODO", archived: false, productId: null, createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => {
  cleanup()
  vi.mocked(createProductAction).mockResolvedValue({ ok: true, value: { id: "p9" } } as never)
  vi.mocked(archiveProductAction).mockResolvedValue({ ok: true, value: null } as never)
  vi.mocked(updateInitiativeAction).mockResolvedValue({ ok: true, value: {} } as never)
})

it("creates a product from the form", async () => {
  const { getByText, getByLabelText } = render(<ProductsClient products={[]} initiatives={[]} canEdit />)
  fireEvent.click(getByText("New product"))
  fireEvent.change(getByLabelText("Product name"), { target: { value: "Web App" } })
  await act(async () => { fireEvent.click(getByText("Create product")) })
  expect(createProductAction).toHaveBeenCalledWith(expect.objectContaining({ name: "Web App" }))
})

it("shows a product with its initiative count", () => {
  const { getByText } = render(<ProductsClient products={[product]} initiatives={[init({ productId: "p1" })]} canEdit />)
  expect(getByText("1 initiative")).toBeTruthy()
})

it("assigning an initiative to a product calls updateInitiativeAction", async () => {
  const { getByLabelText } = render(<ProductsClient products={[product]} initiatives={[init({})]} canEdit />)
  await act(async () => { fireEvent.change(getByLabelText("Product for App Store Release"), { target: { value: "p1" } }) })
  expect(updateInitiativeAction).toHaveBeenCalledWith("i1", { productId: "p1" })
})

it("archiving a product calls archiveProductAction", async () => {
  const { getByLabelText } = render(<ProductsClient products={[product]} initiatives={[]} canEdit />)
  await act(async () => { fireEvent.click(getByLabelText("Archive iOS")) })
  expect(archiveProductAction).toHaveBeenCalledWith("p1")
})
