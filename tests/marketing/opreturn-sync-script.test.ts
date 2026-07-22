import { it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { OPRETURN_COLUMNS, OPRETURN_OPTIONAL_COLUMNS } from "@/lib/marketing/opreturn-types"

/**
 * scripts/sync-opreturn.mjs is the k8s CronJob entrypoint that actually writes OpReturnDaily.
 * It runs as a standalone .mjs under plain node (no bundler, no ts), so it cannot import the
 * shared column constants and repeats them as literals.
 *
 * That duplication silently broke the site once: the 21-column CSV rollout added txAlkRunestone
 * and txPureRunes to OPRETURN_OPTIONAL_COLUMNS (the reader's list) but not to the script's
 * OPTIONAL_COLS, so the daily sync never wrote those two columns. A one-off manual backfill made
 * the charts look fine for two days; when the census froze, every row created afterwards got NULL
 * and nothing ever healed them. The public CSV had the values the whole time — the two Runestone
 * charts on /metrics were frozen on stale data for ~13 days before anyone noticed.
 *
 * Asserting on the file's text is deliberately crude: the script has top-level side effects (it
 * throws without DATABASE_URL and immediately runs the sync), so it can't be imported to inspect
 * the real bindings. Crude and green beats elegant and absent — the failure mode this guards is
 * "someone adds a column and forgets this file", which a text diff catches perfectly well.
 */
// process.cwd(), not import.meta.url: under vitest the module's own url is an http:// dev-server
// URL, so fileURLToPath rejects it ("The URL must be of scheme file"). vitest pins cwd to the
// project root, which is where scripts/ lives.
const SCRIPT = readFileSync(join(process.cwd(), "scripts", "sync-opreturn.mjs"), "utf8")

function literalArray(name: string): string[] {
  const m = SCRIPT.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))
  if (!m) throw new Error(`${name} not found in scripts/sync-opreturn.mjs — did the script change shape?`)
  return [...m[1].matchAll(/"([^"]+)"/g)].map((q) => q[1])
}

it("the CronJob script's OPTIONAL_COLS matches OPRETURN_OPTIONAL_COLUMNS", () => {
  expect(literalArray("OPTIONAL_COLS")).toEqual(OPRETURN_OPTIONAL_COLUMNS)
})

it("the CronJob script's BASE_COLS matches OPRETURN_COLUMNS", () => {
  expect(literalArray("BASE_COLS")).toEqual(OPRETURN_COLUMNS)
})

it("carries the two Runestone columns that the 21-column rollout missed", () => {
  // Explicit regression guard for the exact columns that were dropped, so a future refactor that
  // rewrites the lists wholesale still trips on the specific bug this file was written for.
  const optional = literalArray("OPTIONAL_COLS")
  expect(optional).toContain("txAlkRunestone")
  expect(optional).toContain("txPureRunes")
})
