import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { ProfileForm } from "@/components/cms/ProfileForm"
import { ChangePasswordForm } from "@/components/cms/ChangePasswordForm"
import { TwoFactorManager } from "@/components/cms/TwoFactorManager"
import { SessionsManager } from "@/components/cms/SessionsManager"
import { listMySessions } from "@/actions/cms/sessions"
import { remainingRecoveryCodes } from "@/actions/cms/totp"

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  const user = await prisma.user.findUnique({ where: { id: me.id } })
  if (!user) redirect("/admin/login")

  const recoveryRemaining = user.totpEnabled ? await remainingRecoveryCodes() : 0
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
    <div className="mx-auto max-w-[1040px] space-y-14">
      <section className="grid gap-10 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-4 text-[15px] font-medium text-[color:var(--ed-muted)]">Account</p>
          <h1 className="text-[52px] font-normal leading-[0.98] text-[color:var(--ed-ink)] sm:text-[72px]">Profile</h1>
          <p className="mt-5 max-w-[320px] text-[17px] leading-[1.5] text-[color:var(--ed-body)]">
            Manage the author profile and account details connected to your articles.
          </p>
        </div>
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
      </section>
      <section className="grid gap-10 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-4 text-[15px] font-medium text-[color:var(--ed-muted)]">Security</p>
          <h2 className="text-[40px] font-normal leading-none text-[color:var(--ed-ink)]">Access</h2>
        </div>
        <div className="space-y-6">
          <ChangePasswordForm />
          <TwoFactorManager enabled={user.totpEnabled} recoveryRemaining={recoveryRemaining} />
          <SessionsManager sessions={sessions} />
        </div>
      </section>
    </div>
  )
}
