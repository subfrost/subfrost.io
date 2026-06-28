import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { LEGAL_VIEW, LEGAL_EDIT, hasFinancials } from "@/lib/financials/legal/privilege"
import { entityProfileAction, legalLinkablesAction } from "@/actions/cms/legal"
import { LegalEntityProfile } from "@/components/cms/legal/LegalEntityProfile"

export const dynamic = "force-dynamic"

export default async function LegalEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(LEGAL_VIEW)) redirect("/admin")

  const { id } = await params
  const res = await entityProfileAction(id)
  if (!res.ok) {
    if (res.error === "not_found") notFound()
    redirect("/admin")
  }

  const linkRes = await legalLinkablesAction()
  const linkables = linkRes.ok ? linkRes : { users: [], shareholders: [], payees: [] }

  return (
    <LegalEntityProfile
      profile={res.profile}
      canEdit={me.privileges.includes(LEGAL_EDIT)}
      viewerHasFinancials={hasFinancials(me)}
      users={linkables.users}
      shareholders={linkables.shareholders}
      payees={linkables.payees}
    />
  )
}
