import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { ProfileForm } from "@/components/cms/ProfileForm"
import { ChangePasswordForm } from "@/components/cms/ChangePasswordForm"
import { TwoFactorManager } from "@/components/cms/TwoFactorManager"
import { SessionsManager } from "@/components/cms/SessionsManager"
import { ApiKeysManager } from "@/components/cms/ApiKeysManager"
import { listMySessions } from "@/actions/cms/sessions"
import { listMyApiKeys } from "@/actions/cms/apikeys"
import { remainingRecoveryCodes } from "@/actions/cms/totp"

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  const user = await prisma.user.findUnique({ where: { id: me.id } })
  if (!user) redirect("/admin/login")

  const recoveryRemaining = user.totpEnabled ? await remainingRecoveryCodes() : 0
  const myKeys = (await listMyApiKeys()).map((k) => ({ ...k, ownerEmail: null }))
  const sessions = (await listMySessions()).map((s) => ({
    id: s.id,
    ip: s.ip,
    userAgent: s.userAgent,
    tlsFingerprint: s.tlsFingerprint,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.current,
  }))

  return (
    <div className="space-y-10">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-white">My profile</h1>
        <p className="mb-6 text-sm text-zinc-500">Shown as the author byline on your articles.</p>
        <ProfileForm
          canEditBio={me.privileges.includes("articles.edit_bio") || me.privileges.includes("iam.modify_user")}
          initial={{
            id: user.id,
            email: user.email,
            name: user.name ?? "",
            bio: user.bio ?? "",
            twitter: user.twitter ?? "",
            avatarUrl: user.avatarUrl ?? "",
            status: user.status ?? "",
          }}
        />
      </div>
      <div className="space-y-5">
        <h2 className="text-lg font-semibold text-white">Security</h2>
        <ChangePasswordForm />
        <TwoFactorManager enabled={user.totpEnabled} recoveryRemaining={recoveryRemaining} />
        <SessionsManager sessions={sessions} />
      </div>
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-white">API keys &amp; CLI</h2>
          <p className="text-sm text-zinc-500">Personal keys for the <code className="text-zinc-300">subfrost</code> CLI and the REST API.</p>
        </div>
        <ApiKeysManager variant="self" keys={myKeys} grantableScopes={me.privileges} showOwner={false} />
      </div>
    </div>
  )
}
