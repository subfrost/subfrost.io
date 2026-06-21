import Link from "next/link"
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"

export const dynamic = "force-dynamic"

const SURFACES: { key: string; label: string; href: string; desc: string; ready: boolean }[] = [
  { key: "subscriptions", label: "Subscriptions", href: "/admin/billing/subscriptions", desc: "Tiers & subscribers", ready: true },
  { key: "promo", label: "Promo codes", href: "/admin/billing/promo", desc: "Coupons & promotion codes", ready: true },
  { key: "treasury", label: "Treasury", href: "/admin/billing/treasury", desc: "Balances, transactions, ACH", ready: true },
  { key: "issuing", label: "Issuing", href: "/admin/billing/issuing", desc: "Cards, controls, disputes", ready: true },
  { key: "offramp", label: "Offramp", href: "/admin/billing/offramp", desc: "Crypto→fiat settlements", ready: false },
  { key: "customers", label: "Customers", href: "/admin/billing/customers", desc: "Subscriptions, invoices, charges", ready: false },
  { key: "applications", label: "Applications", href: "/admin/billing/applications", desc: "Stripe product onboarding", ready: true },
]

export default async function BillingPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("MANAGE_BILLING")) redirect("/admin")

  const live = isLive()

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Billing</h1>
      <BillingBanner live={live} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SURFACES.map((s) =>
          s.ready ? (
            <Link
              key={s.key}
              href={s.href}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-600 transition-colors"
            >
              <div className="font-semibold text-white">{s.label}</div>
              <div className="mt-1 text-sm text-zinc-400">{s.desc}</div>
            </Link>
          ) : (
            <div
              key={s.key}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 opacity-50 cursor-default"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{s.label}</span>
                <span className="rounded px-1.5 py-0.5 text-xs bg-zinc-800 text-zinc-400">Coming soon</span>
              </div>
              <div className="mt-1 text-sm text-zinc-400">{s.desc}</div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
