import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { payeeProfileAction, listLinkableUsersAction } from "@/actions/cms/accounting"
import { PayeeProfile } from "@/components/cms/financials/PayeeProfile"

export const dynamic = "force-dynamic"

export default async function PayeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  const { id } = await params
  const res = await payeeProfileAction(id)
  if (!res.ok) {
    if (res.error === "not_found") notFound()
    redirect("/admin")
  }

  const usersRes = await listLinkableUsersAction()
  const users = usersRes.ok ? usersRes.users : []

  return <PayeeProfile profile={res.profile} linkableUsers={users} />
}
