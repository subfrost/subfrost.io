import { it, expect } from "vitest"
import { TASK_STATUS, TASK_PRIORITY, STATUS_ORDER, ownerInitials, ownerName } from "@/lib/tasks/types"

it("has metadata for every status and an explicit column order", () => {
  expect(STATUS_ORDER).toEqual(["TODO", "IN_PROGRESS", "DONE"])
  expect(TASK_STATUS.TODO.label).toBe("To do")
  expect(TASK_STATUS.IN_PROGRESS.label).toBe("Doing")
  expect(TASK_STATUS.DONE.label).toBe("Done")
})

it("ranks priorities HIGH > MEDIUM > LOW", () => {
  expect(TASK_PRIORITY.HIGH.rank).toBeGreaterThan(TASK_PRIORITY.MEDIUM.rank)
  expect(TASK_PRIORITY.MEDIUM.rank).toBeGreaterThan(TASK_PRIORITY.LOW.rank)
})

it("derives owner initials and a display name", () => {
  expect(ownerInitials({ name: "Vitor Texeira", email: "v@x.io" })).toBe("VT")
  expect(ownerInitials({ name: null, email: "gabe@subfrost.io" })).toBe("GS")
  expect(ownerInitials(null)).toBe("?")
  expect(ownerName(null)).toBe("Unassigned")
  expect(ownerName({ name: "Gabe", email: "g@x.io" })).toBe("Gabe")
})
