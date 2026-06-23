import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { ReviewsManager } from "@/components/cms/compliance/ReviewsManager"

export const dynamic = "force-dynamic"

export default async function ReviewsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("compliance.reviews")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Reviewer links</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Mint password-protected, scoped, expiring links so an external AML reviewer (with no platform
        account) can view the compliance surfaces you share. Passwords are shown once at creation and
        every link can be revoked instantly.
      </p>
      <ReviewsManager />
    </div>
  )
}
