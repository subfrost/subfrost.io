import { it, expect } from "vitest"
import { TASK_STATUS, TASK_PRIORITY, STATUS_ORDER, INITIATIVE_STATUS, INITIATIVE_STATUS_ORDER, ownerInitials, ownerName } from "@/lib/tasks/types"

it("has metadata for every status and an explicit column order", () => {
  expect(STATUS_ORDER).toEqual(["REQUESTED", "TODO", "IN_PROGRESS", "DONE"])
  expect(TASK_STATUS.REQUESTED.label).toBe("Requested Tasks")
  expect(TASK_STATUS.BLOCKED.label).toBe("Blocked")
  expect(TASK_STATUS.TODO.label).toBe("To do")
  expect(TASK_STATUS.IN_PROGRESS.label).toBe("In Progress")
  expect(TASK_STATUS.DONE.label).toBe("Done")
})

it("ranks priorities FIRE > HIGH > MEDIUM > LOW", () => {
  expect(TASK_PRIORITY.FIRE.rank).toBeGreaterThan(TASK_PRIORITY.HIGH.rank)
  expect(TASK_PRIORITY.HIGH.rank).toBeGreaterThan(TASK_PRIORITY.MEDIUM.rank)
  expect(TASK_PRIORITY.MEDIUM.rank).toBeGreaterThan(TASK_PRIORITY.LOW.rank)
})

it("mirrors the task columns for initiatives with On hold", () => {
  expect(INITIATIVE_STATUS_ORDER).toEqual(["TODO", "ON_HOLD", "IN_PROGRESS", "DONE"])
  expect(INITIATIVE_STATUS.ON_HOLD.label).toBe("On hold")
})

it("derives owner initials and a display name", () => {
  expect(ownerInitials({ name: "Vitor Texeira", email: "v@x.io" })).toBe("VT")
  expect(ownerInitials({ name: null, email: "gabe@subfrost.io" })).toBe("GS")
  expect(ownerInitials(null)).toBe("?")
  expect(ownerName(null)).toBe("Unassigned")
  expect(ownerName({ name: "Gabe", email: "g@x.io" })).toBe("Gabe")
})
