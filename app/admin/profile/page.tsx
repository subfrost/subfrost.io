import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { ProfileForm } from "@/components/cms/ProfileForm"

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  const user = await prisma.user.findUnique({ where: { id: me.id } })
  if (!user) redirect("/admin/login")

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">My profile</h1>
      <p className="mb-6 text-sm text-zinc-500">Shown as the author byline on your articles.</p>
      <ProfileForm
        initial={{
          id: user.id,
          email: user.email,
          name: user.name ?? "",
          bio: user.bio ?? "",
          twitter: user.twitter ?? "",
          avatarUrl: user.avatarUrl ?? "",
        }}
      />
    </div>
  )
}
