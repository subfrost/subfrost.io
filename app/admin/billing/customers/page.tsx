import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"
import { CustomersManager } from "@/components/cms/billing/CustomersManager"

export const dynamic = "force-dynamic"

export default async function CustomersPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("BILLING_VIEW")) redirect("/admin")
  const canEdit = me.privileges.includes("BILLING_EDIT")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Customers</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Per-customer subscriptions, invoices, payment methods, and charges. Refunds are queued for
        confirmation.
      </p>
      <BillingBanner live={isLive()} />
      <CustomersManager canEdit={canEdit} />
    </div>
  )
}
