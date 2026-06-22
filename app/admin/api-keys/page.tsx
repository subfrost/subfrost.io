import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { ALL_PRIVILEGES } from "@/lib/cms/privileges"
import { ApiKeysManager, type KeyRow } from "@/components/cms/ApiKeysManager"

export const dynamic = "force-dynamic"

export default async function ApiKeysPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("apikeys.manage")) redirect("/admin")

  // You see your own keys; user-managers see everyone's.
  const seeAll = me.privileges.includes("iam.modify_user")
  const keys = await prisma.apiKey.findMany({
    where: seeAll ? {} : { userId: me.id },
    orderBy: { createdAt: "desc" },
    include: seeAll ? { createdBy: { select: { email: true } } } : undefined,
  })

  const rows: KeyRow[] = keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    revoked: k.revoked,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
    ownerEmail: seeAll ? (k as { createdBy?: { email: string } }).createdBy?.email ?? null : null,
  }))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">API keys</h1>
      <ApiKeysManager keys={rows} grantableScopes={ALL_PRIVILEGES.filter((p) => me.privileges.includes(p))} showOwner={seeAll} />
    </div>
  )
}
