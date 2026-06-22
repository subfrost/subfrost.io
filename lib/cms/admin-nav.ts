import {
  FileText, PlusCircle, Megaphone, Fuel, Ticket, ShieldCheck, MapPin,
  CreditCard, LayoutGrid, Repeat, Tag, Landmark, ArrowLeftRight, ArrowDownToLine, Users,
  ClipboardList, Settings, KeyRound, ScrollText, Webhook, Network, LayoutDashboard, Banknote, Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Privilege } from "@/lib/cms/privileges"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"

export interface NavLeaf {
  label: string
  href: string
  icon: LucideIcon
  privilege?: Privilege
}

export interface NavGroup {
  key: string
  label: string
  icon: LucideIcon
  items: NavLeaf[]
}

// The full nav tree. Articles is ungated (it is the /admin landing). Every other
// leaf names the privilege that unlocks it; visibleNav() drops empty groups.
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "overview", label: "Overview", icon: LayoutDashboard, items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    key: "articles", label: "Articles", icon: FileText, items: [
      { label: "All articles", href: "/admin/articles", icon: FileText },
      { label: "New article", href: "/admin/articles/new", icon: PlusCircle },
    ],
  },
  {
    key: "community", label: "Community", icon: Megaphone, items: [
      { label: "Dashboard", href: "/admin/communities", icon: Network, privilege: "referral.read" },
      { label: "FUEL", href: "/admin/fuel", icon: Fuel, privilege: "fuel.read" },
      { label: "Referral codes", href: "/admin/codes", icon: Ticket, privilege: "referral.read" },
    ],
  },
  {
    key: "compliance", label: "Compliance", icon: ShieldCheck, items: [
      { label: "KYC review", href: "/admin/kyc", icon: ShieldCheck, privilege: "aml.read" },
      { label: "FinCEN filings", href: "/admin/fincen", icon: FileText, privilege: "aml.read" },
      { label: "MTL licensing", href: "/admin/mtl", icon: MapPin, privilege: "aml.read" },
    ],
  },
  {
    key: "billing", label: "Billing", icon: CreditCard, items: [
      { label: "Overview", href: "/admin/billing", icon: LayoutGrid, privilege: "billing.read" },
      { label: "Subscriptions", href: "/admin/billing/subscriptions", icon: Repeat, privilege: "billing.read" },
      { label: "Promo codes", href: "/admin/billing/promo", icon: Tag, privilege: "billing.read" },
      { label: "Treasury", href: "/admin/billing/treasury", icon: Landmark, privilege: "billing.read" },
      { label: "Issuing", href: "/admin/billing/issuing", icon: CreditCard, privilege: "billing.read" },
      { label: "Offramp", href: "/admin/billing/offramp", icon: ArrowLeftRight, privilege: "billing.read" },
      { label: "On-ramp", href: "/admin/billing/onramp", icon: ArrowDownToLine, privilege: "billing.read" },
      { label: "Customers", href: "/admin/billing/customers", icon: Users, privilege: "billing.read" },
      { label: "Applications", href: "/admin/billing/applications", icon: ClipboardList, privilege: "billing.read" },
      { label: "Webhook events", href: "/admin/billing/events", icon: Webhook, privilege: "billing.read" },
    ],
  },
  {
    key: "financials", label: "Financials", icon: Banknote, items: [
      { label: "Treasury", href: "/admin/financials/treasury", icon: Wallet, privilege: FINANCIALS_PRIVILEGE },
      { label: "Accounting", href: "/admin/financials/accounting", icon: ClipboardList, privilege: FINANCIALS_PRIVILEGE },
    ],
  },
  {
    key: "settings", label: "Settings", icon: Settings, items: [
      { label: "Users", href: "/admin/users", icon: Users, privilege: "iam.list_users" },
      { label: "API keys", href: "/admin/api-keys", icon: KeyRound, privilege: "apikeys.manage" },
      { label: "Audit log", href: "/admin/audit", icon: ScrollText, privilege: "audit.view" },
    ],
  },
]

/** Filter items by privilege and drop any group left with no items. Never mutates NAV_GROUPS. */
export function visibleNav(privileges: string[]): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.privilege || privileges.includes(it.privilege)),
    }))
    .filter((g) => g.items.length > 0)
}

/** Active-route matching. Dashboard is exact /admin; the Articles list also
 *  stays active while editing an article (/admin/articles/[id]) but not on /new. */
export function isItemActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin"
  if (href === "/admin/articles") {
    return (
      pathname === "/admin/articles" ||
      (pathname.startsWith("/admin/articles/") && pathname !== "/admin/articles/new")
    )
  }
  if (href === "/admin/articles/new") return pathname === "/admin/articles/new"
  return pathname === href
}

export function groupHasActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((it) => isItemActive(it.href, pathname))
}

/** Primeira folha visível fora dos grupos Overview/Articles (p/ landing de quem
 *  não vê artigos). Overview (o Dashboard) é o landing universal, então é pulado. */
export function firstNonArticleLeaf(privileges: string[]): string | null {
  for (const g of visibleNav(privileges)) {
    if (g.key === "articles" || g.key === "overview") continue
    if (g.items[0]) return g.items[0].href
  }
  return null
}
