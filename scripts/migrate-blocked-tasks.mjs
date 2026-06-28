/**
 * One-off: migrate legacy BLOCKED tasks to the new model.
 * status BLOCKED -> IN_PROGRESS, blocked=true. Idempotent (re-runs match 0 rows).
 * Run locally against prod via cloud-sql-proxy (DATABASE_URL set), mirroring
 * scripts/migrate-compliance-data.ts. Usage:
 *   node scripts/migrate-blocked-tasks.mjs
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
try {
  const r = await prisma.task.updateMany({
    where: { status: "BLOCKED" },
    data: { status: "IN_PROGRESS", blocked: true },
  })
  console.log(`[migrate-blocked] ${r.count} task(s): BLOCKED -> IN_PROGRESS + blocked=true`)
} finally {
  await prisma.$disconnect()
}
