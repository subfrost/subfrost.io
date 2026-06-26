import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/tasks/board", () => ({
  createTaskAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "t9" } }),
  claimTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  moveTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  deleteTaskAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
  assignTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  updateTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  bulkCreateTasksAction: vi.fn().mockResolvedValue({ ok: true, value: { count: 2 } }),
}))

import * as boardActions from "@/actions/tasks/board"
import { BoardClient } from "@/components/cms/board/BoardClient"
import type { TaskView, InitiativeView, MemberView } from "@/lib/tasks/types"

const init: InitiativeView = { id: "i1", name: "frUSD deployment", goal: "ship", color: "#1D9E75", status: "TODO", archived: false, createdAt: new Date(), updatedAt: new Date() }
const members: MemberView[] = [{ id: "u2", name: "Gabe", email: "g@x.io" }]
const task = (over: Partial<TaskView>): TaskView => ({
  id: "t1", title: "Audit mint path", description: "", status: "TODO", priority: "HIGH",
  labels: ["subfrost-app"], blockerReason: "", owner: null, initiativeId: "i1", position: 0,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => {
  cleanup()
  vi.mocked(boardActions.createTaskAction).mockResolvedValue({ ok: true, value: { id: "t9" } } as never)
  vi.mocked(boardActions.claimTaskAction).mockResolvedValue({ ok: true, value: {} } as never)
  vi.mocked(boardActions.moveTaskAction).mockResolvedValue({ ok: true, value: {} } as never)
  vi.mocked(boardActions.deleteTaskAction).mockResolvedValue({ ok: true, value: null } as never)
  vi.mocked(boardActions.assignTaskAction).mockResolvedValue({ ok: true, value: {} } as never)
  vi.mocked(boardActions.updateTaskAction).mockResolvedValue({ ok: true, value: {} } as never)
  vi.mocked(boardActions.bulkCreateTasksAction).mockResolvedValue({ ok: true, value: { count: 2 } } as never)
})

it("renders the four columns including Blocked", () => {
  const { getAllByText } = render(<BoardClient tasks={[task({})]} initiatives={[init]} members={members} meId="u1" canEdit />)
  // "Blocked"/"In Progress" appear as a column header AND as a status <option>, so match >= 1
  expect(getAllByText("Blocked").length).toBeGreaterThan(0)
  expect(getAllByText("In Progress").length).toBeGreaterThan(0)
})

it("self-assign calls claimTaskAction", async () => {
  const { getByText } = render(<BoardClient tasks={[task({ owner: null })]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.click(getByText(/Self-assign/i)) })
  const { claimTaskAction } = await import("@/actions/tasks/board")
  expect(claimTaskAction).toHaveBeenCalledWith("t1")
})

it("the Assign dropdown assigns the task to another member", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({ owner: null })]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getByLabelText("Assign"), { target: { value: "u2" } }) })
  const { assignTaskAction } = await import("@/actions/tasks/board")
  expect(assignTaskAction).toHaveBeenCalledWith("t1", "u2")
})

it("has no green Done button on the card", () => {
  const { queryByText } = render(<BoardClient tasks={[task({ status: "IN_PROGRESS" })]} initiatives={[init]} members={members} meId="u1" canEdit />)
  expect(queryByText("Done", { selector: "button" })).toBeNull()
})

it("shows the blocker input only for blocked tasks and saves it on blur", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({ status: "BLOCKED" })]} initiatives={[init]} members={members} meId="u1" canEdit />)
  const input = getByLabelText("Blocker reason")
  await act(async () => { fireEvent.change(input, { target: { value: "waiting on flex" } }); fireEvent.blur(input) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { blockerReason: "waiting on flex" })
})

it("changing the priority dropdown calls updateTaskAction", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({})]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getByLabelText("Priority"), { target: { value: "FIRE" } }) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { priority: "FIRE" })
})

it("the initiative dropdown reassigns the task initiative", async () => {
  const other: InitiativeView = { ...init, id: "i2", name: "Treasury", status: "IN_PROGRESS" }
  const { getAllByLabelText } = render(<BoardClient tasks={[task({})]} initiatives={[init, other]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getAllByLabelText("Initiative")[0], { target: { value: "i2" } }) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { initiativeId: "i2" })
})

it("Bulk Add creates tasks under the chosen initiative", async () => {
  const { getByText, getByLabelText } = render(<BoardClient tasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  fireEvent.click(getByText("Bulk Add"))
  fireEvent.change(getByLabelText("Bulk initiative"), { target: { value: "i1" } })
  fireEvent.change(getByLabelText("Bulk tasks"), { target: { value: "Deploy\nAudit" } })
  await act(async () => { fireEvent.click(getByText("Add tasks")) })
  const { bulkCreateTasksAction } = await import("@/actions/tasks/board")
  expect(bulkCreateTasksAction).toHaveBeenCalledWith({ initiativeId: "i1", titles: ["Deploy", "Audit"] })
})
