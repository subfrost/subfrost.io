import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/tasks/board", () => ({
  createTaskAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "t9" } }),
  claimTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  moveTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  deleteTaskAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
}))

import { BoardClient } from "@/components/cms/board/BoardClient"
import type { TaskView, InitiativeView } from "@/lib/tasks/types"

const init: InitiativeView = { id: "i1", name: "frUSD deployment", goal: "ship", color: "#1D9E75", status: "TODO", archived: false, createdAt: new Date(), updatedAt: new Date() }
const task = (over: Partial<TaskView>): TaskView => ({
  id: "t1", title: "Audit mint path", description: "", status: "TODO", priority: "HIGH",
  labels: ["subfrost-app"], blockerReason: "", owner: null, initiativeId: "i1", position: 0,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => cleanup())

it("renders tasks and the initiative chip", () => {
  const { getByText, getAllByText } = render(<BoardClient tasks={[task({})]} initiatives={[init]} meId="u1" canEdit />)
  expect(getByText("Audit mint path")).toBeTruthy()
  // initiative name appears in both the filter pill and the task card
  expect(getAllByText("frUSD deployment").length).toBeGreaterThanOrEqual(2)
})

it("quick-add submits createTaskAction with the active initiative", async () => {
  const { getByPlaceholderText } = render(<BoardClient tasks={[]} initiatives={[init]} meId="u1" canEdit />)
  const input = getByPlaceholderText(/Quick add/i)
  await act(async () => {
    fireEvent.change(input, { target: { value: "New task" } })
    fireEvent.keyDown(input, { key: "Enter" })
  })
  const { createTaskAction } = await import("@/actions/tasks/board")
  expect(createTaskAction).toHaveBeenCalled()
})

it("toggles to the list view (Priority header appears)", () => {
  const { getByText } = render(<BoardClient tasks={[task({})]} initiatives={[init]} meId="u1" canEdit />)
  fireEvent.click(getByText("List"))
  expect(getByText("Priority")).toBeTruthy()
})

it("assign-to-me calls claimTaskAction", async () => {
  const { getByText } = render(<BoardClient tasks={[task({ owner: null })]} initiatives={[init]} meId="u1" canEdit />)
  await act(async () => {
    fireEvent.click(getByText(/Assign to me/i))
  })
  const { claimTaskAction } = await import("@/actions/tasks/board")
  expect(claimTaskAction).toHaveBeenCalledWith("t1")
})

it("filtering by an initiative hides non-matching tasks", () => {
  const tasks = [task({ id: "a", title: "In frUSD", initiativeId: "i1" }), task({ id: "b", title: "No initiative", initiativeId: null })]
  const { getByText, getByRole, queryByText } = render(<BoardClient tasks={tasks} initiatives={[init]} meId="u1" canEdit />)
  fireEvent.click(getByRole("button", { name: "frUSD deployment" }))
  expect(queryByText("No initiative")).toBeNull()
  expect(getByText("In frUSD")).toBeTruthy()
})
