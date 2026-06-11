import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser, hasRole } from "@/lib/cms/authz"
import { ApiKeysManager, type KeyRow } from "@/components/cms/ApiKeysManager"

export const dynamic = "force-dynamic"

export default async function ApiKeysPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!hasRole(me.role, "EDITOR")) redirect("/admin")

  // Editors see their own keys; admins see all.
  const keys = await prisma.apiKey.findMany({
    where: me.role === "ADMIN" ? {} : { userId: me.id },
    orderBy: { createdAt: "desc" },
  })

  const rows: KeyRow[] = keys.map((k) => ({
    id: k.id, name: k.name, prefix: k.prefix, revoked: k.revoked,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
  }))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">API keys</h1>
      <ApiKeysManager keys={rows} />
    </div>
  )
}
