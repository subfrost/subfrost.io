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
  restoreTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  purgeTaskAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
  listCommentsAction: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addCommentAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  deleteCommentAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
}))

import * as boardActions from "@/actions/tasks/board"
import { BoardClient } from "@/components/cms/board/BoardClient"
import type { TaskView, InitiativeView, MemberView } from "@/lib/tasks/types"

const init: InitiativeView = { id: "i1", name: "frUSD deployment", goal: "ship", color: "#1D9E75", status: "TODO", archived: false, createdAt: new Date(), updatedAt: new Date() }
const members: MemberView[] = [{ id: "u2", name: "Gabe", email: "g@x.io" }]
const task = (over: Partial<TaskView>): TaskView => ({
  id: "t1", title: "Audit mint path", description: "", status: "TODO", priority: "HIGH",
  labels: ["subfrost-app"], blockerReason: "", color: "", colorLabel: "", checklist: [], commentCount: 0, owner: null, initiativeId: "i1", position: 0,
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
  vi.mocked(boardActions.listCommentsAction).mockResolvedValue({ ok: true, value: [] } as never)
  vi.mocked(boardActions.restoreTaskAction).mockResolvedValue({ ok: true, value: {} } as never)
  vi.mocked(boardActions.purgeTaskAction).mockResolvedValue({ ok: true, value: null } as never)
})

it("renders the four columns including Blocked", () => {
  const { getAllByText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  // "Blocked"/"In Progress" appear as a column header AND as a status <option>, so match >= 1
  expect(getAllByText("Blocked").length).toBeGreaterThan(0)
  expect(getAllByText("In Progress").length).toBeGreaterThan(0)
})

it("self-assign calls claimTaskAction", async () => {
  const { getByText } = render(<BoardClient tasks={[task({ owner: null })]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.click(getByText(/Self-assign/i)) })
  const { claimTaskAction } = await import("@/actions/tasks/board")
  expect(claimTaskAction).toHaveBeenCalledWith("t1")
})

it("the Assign dropdown assigns the task to another member", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({ owner: null })]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getByLabelText("Assign"), { target: { value: "u2" } }) })
  const { assignTaskAction } = await import("@/actions/tasks/board")
  expect(assignTaskAction).toHaveBeenCalledWith("t1", "u2")
})

it("shows the assignee's full name when the task has an owner", () => {
  const owned = task({ owner: { id: "u9", name: "Vitor", email: "v@x.io" } })
  const { getByText } = render(<BoardClient tasks={[owned]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  // "Vitor" isn't in `members`, so it only renders as the assignee name span (not an <option>)
  expect(getByText("Vitor")).toBeTruthy()
})

it("has no green Done button on the card", () => {
  const { queryByText } = render(<BoardClient tasks={[task({ status: "IN_PROGRESS" })]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  expect(queryByText("Done", { selector: "button" })).toBeNull()
})

it("shows the blocker input only for blocked tasks and saves it on blur", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({ status: "BLOCKED" })]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  const input = getByLabelText("Blocker reason")
  await act(async () => { fireEvent.change(input, { target: { value: "waiting on flex" } }); fireEvent.blur(input) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { blockerReason: "waiting on flex" })
})

it("changing the priority dropdown calls updateTaskAction", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getByLabelText("Priority"), { target: { value: "FIRE" } }) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { priority: "FIRE" })
})

it("the initiative dropdown reassigns the task initiative", async () => {
  const other: InitiativeView = { ...init, id: "i2", name: "Treasury", status: "IN_PROGRESS" }
  const { getAllByLabelText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init, other]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getAllByLabelText("Initiative")[0], { target: { value: "i2" } }) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { initiativeId: "i2" })
})

it("Bulk Add creates tasks under the chosen initiative", async () => {
  const { getByText, getByLabelText } = render(<BoardClient tasks={[]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  fireEvent.click(getByText("Bulk Add"))
  fireEvent.change(getByLabelText("Bulk initiative"), { target: { value: "i1" } })
  fireEvent.change(getByLabelText("Bulk tasks"), { target: { value: "Deploy\nAudit" } })
  await act(async () => { fireEvent.click(getByText("Add tasks")) })
  const { bulkCreateTasksAction } = await import("@/actions/tasks/board")
  expect(bulkCreateTasksAction).toHaveBeenCalledWith({ initiativeId: "i1", titles: ["Deploy", "Audit"] })
})

it("clicking a task title opens the detail panel and loads its comments", async () => {
  const { getByText, getByLabelText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.click(getByText("Audit mint path")) })
  // Detail panel renders the editable title and the Close control.
  expect(getByLabelText("Close")).toBeTruthy()
  expect(getByText("Description")).toBeTruthy()
  const { listCommentsAction } = await import("@/actions/tasks/board")
  expect(listCommentsAction).toHaveBeenCalledWith("t1")
})

it("renders a checklist progress badge on the card", () => {
  const { getByText } = render(
    <BoardClient
      tasks={[task({ checklist: [{ id: "a", text: "one", checked: true }, { id: "b", text: "two", checked: false }] })]}
      deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit
    />,
  )
  expect(getByText("1/2")).toBeTruthy()
})

it("shows the recycle bin with the deleted task count", () => {
  const { getByText } = render(
    <BoardClient tasks={[]} deletedTasks={[task({ id: "d1", title: "Old thing" })]} initiatives={[init]} members={members} meId="u1" canEdit />,
  )
  fireEvent.click(getByText("Deleted"))
  expect(getByText("Old thing")).toBeTruthy()
})

it("renders the color tag chip on the card", () => {
  const { getByText } = render(
    <BoardClient tasks={[task({ color: "#ef4444", colorLabel: "bug" })]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />,
  )
  expect(getByText("bug")).toBeTruthy()
})

it("clicking the card body (not a control) opens the detail panel", async () => {
  const { getByText, getByLabelText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  // the age badge ("now") is a non-control element inside the card
  await act(async () => { fireEvent.click(getByText("now")) })
  expect(getByLabelText("Close")).toBeTruthy()
})

it("picking a color in the detail saves it with a seeded name", async () => {
  const { getByText, getByLabelText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.click(getByText("Audit mint path")) })
  await act(async () => { fireEvent.click(getByLabelText("Red")) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { color: "#ef4444", colorLabel: "Red" })
})

it("hiding an initiative removes its tasks from the board", () => {
  localStorage.clear()
  const { getByText, getByLabelText, queryByText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  expect(getByText("Audit mint path")).toBeTruthy()
  fireEvent.click(getByText("Show/hide"))
  fireEvent.click(getByLabelText(init.name)) // uncheck the initiative in the visibility popover
  expect(queryByText("Audit mint path")).toBeNull()
})
