import prisma from "@/lib/prisma"

async function main() {
  const existing = await prisma.recurringPush.findFirst({ where: { title: "Weekly report" } })
  if (existing) {
    console.log(`Weekly report rule already exists (${existing.id}) — no-op`)
    return
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } })
  const rule = await prisma.recurringPush.create({
    data: {
      title: "Weekly report",
      channel: "ARTICLE",
      frequency: "WEEKLY",
      dayOfWeek: 5, // Friday
      active: true,
      startDate: new Date("2026-06-29T00:00:00.000Z"),
      createdById: admin?.id ?? null,
    },
  })
  console.log(`Created Weekly report rule ${rule.id}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
