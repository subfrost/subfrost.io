import { test, expect } from "@playwright/test"

// WS1 verification: the marketing schedule must be usable on a 375-wide phone.
// Run with the `mobile` project (iPhone SE = 375x667). Requires an authenticated
// admin storage state (marketing.view) via ADMIN_STORAGE_STATE.
test.describe("marketing schedule — mobile", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/marketing/schedule")
    await expect(page.getByRole("heading", { name: "Marketing schedule" })).toBeVisible()
  })

  test("no horizontal overflow at 375px", async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement!
      return el.scrollWidth - el.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(1) // allow sub-pixel rounding
  })

  test("backlog stacks below the calendar (not side-by-side)", async ({ page }) => {
    const grid = page.locator(".grid.grid-cols-7").last().boundingBox()
    const backlog = page.getByText("Backlog", { exact: true }).boundingBox()
    const [g, b] = await Promise.all([grid, backlog])
    expect(g && b).toBeTruthy()
    // On mobile the backlog header sits below the calendar grid's top.
    expect(b!.y).toBeGreaterThan(g!.y)
  })

  test("the push editor modal fits the viewport", async ({ page }) => {
    await page.getByRole("button", { name: "New push" }).click()
    const modal = page.getByRole("heading", { name: /New push|Edit push/ }).locator("xpath=ancestor::div[1]")
    const box = await modal.boundingBox()
    const vw = page.viewportSize()!.width
    expect(box!.width).toBeLessThanOrEqual(vw)
    expect(box!.x).toBeGreaterThanOrEqual(0)
  })
})
