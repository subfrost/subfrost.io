import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/tasks/board", () => ({
  createInitiativeAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "i9" } }),
  archiveInitiativeAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
}))

import { InitiativesClient } from "@/components/cms/board/InitiativesClient"
import type { InitiativeView, TaskView } from "@/lib/tasks/types"
import { createInitiativeAction, archiveInitiativeAction } from "@/actions/tasks/board"

const init: InitiativeView = { id: "i1", name: "frUSD deployment", goal: "ship it", color: "#1D9E75", status: "TODO", archived: false, createdAt: new Date(), updatedAt: new Date() }
const task = (over: Partial<TaskView>): TaskView => ({
  id: "t", title: "t", description: "", status: "TODO", priority: "MEDIUM",
  labels: [], blockerReason: "", owner: null, initiativeId: "i1", position: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => {
  cleanup()
  vi.mocked(createInitiativeAction).mockResolvedValue({ ok: true, value: { id: "i9" } } as never)
  vi.mocked(archiveInitiativeAction).mockResolvedValue({ ok: true, value: null } as never)
})

it("shows initiative progress (done/total)", () => {
  const { getByText } = render(<InitiativesClient initiatives={[init]} tasks={[task({ status: "DONE" }), task({ status: "TODO" })]} canEdit />)
  expect(getByText("frUSD deployment")).toBeTruthy()
  expect(getByText(/1 \/ 2 done/)).toBeTruthy()
})

it("opens the form, counts seed lines, and submits seedText", async () => {
  const { getByText, getByLabelText } = render(<InitiativesClient initiatives={[]} tasks={[]} canEdit />)
  fireEvent.click(getByText("New initiative"))
  fireEvent.change(getByLabelText("Name"), { target: { value: "frUSD" } })
  fireEvent.change(getByLabelText("Seed tasks"), { target: { value: "Deploy\nAudit" } })
  expect(getByText(/2 tasks will be created/)).toBeTruthy()
  await act(async () => {
    fireEvent.click(getByText("Create + seed"))
  })
  expect(createInitiativeAction).toHaveBeenCalledWith(expect.objectContaining({ name: "frUSD", seedText: "Deploy\nAudit" }))
})
