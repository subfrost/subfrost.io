import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { WebhookEventsManager } from "@/components/cms/billing/WebhookEventsManager"

export const dynamic = "force-dynamic"

export default async function WebhookEventsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("BILLING_VIEW")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Webhook events</h1>
      <p className="mb-6 text-sm text-zinc-500">Live Stripe events received at /api/webhooks/stripe. Read-only log; identity events feed the KYC queue.</p>
      <WebhookEventsManager />
    </div>
  )
}
