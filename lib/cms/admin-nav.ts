import {
  FileText, PlusCircle, Megaphone, Fuel, Ticket, ShieldCheck, MapPin,
  CreditCard, LayoutGrid, Repeat, Tag, Landmark, ArrowLeftRight, Users,
  ClipboardList, Settings, KeyRound, ScrollText,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Privilege } from "@prisma/client"

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
    key: "articles", label: "Articles", icon: FileText, items: [
      { label: "All articles", href: "/admin", icon: FileText },
      { label: "New article", href: "/admin/articles/new", icon: PlusCircle },
    ],
  },
  {
    key: "community", label: "Community", icon: Megaphone, items: [
      { label: "FUEL", href: "/admin/fuel", icon: Fuel, privilege: "MANAGE_FUEL" },
      { label: "Referral codes", href: "/admin/codes", icon: Ticket, privilege: "MANAGE_REFERRAL_CODES" },
    ],
  },
  {
    key: "compliance", label: "Compliance", icon: ShieldCheck, items: [
      { label: "KYC review", href: "/admin/kyc", icon: ShieldCheck, privilege: "MANAGE_AML" },
      { label: "FinCEN filings", href: "/admin/fincen", icon: FileText, privilege: "MANAGE_AML" },
      { label: "MTL licensing", href: "/admin/mtl", icon: MapPin, privilege: "MANAGE_AML" },
    ],
  },
  {
    key: "billing", label: "Billing", icon: CreditCard, items: [
      { label: "Overview", href: "/admin/billing", icon: LayoutGrid, privilege: "MANAGE_BILLING" },
      { label: "Subscriptions", href: "/admin/billing/subscriptions", icon: Repeat, privilege: "MANAGE_BILLING" },
      { label: "Promo codes", href: "/admin/billing/promo", icon: Tag, privilege: "MANAGE_BILLING" },
      { label: "Treasury", href: "/admin/billing/treasury", icon: Landmark, privilege: "MANAGE_BILLING" },
      { label: "Issuing", href: "/admin/billing/issuing", icon: CreditCard, privilege: "MANAGE_BILLING" },
      { label: "Offramp", href: "/admin/billing/offramp", icon: ArrowLeftRight, privilege: "MANAGE_BILLING" },
      { label: "Customers", href: "/admin/billing/customers", icon: Users, privilege: "MANAGE_BILLING" },
      { label: "Applications", href: "/admin/billing/applications", icon: ClipboardList, privilege: "MANAGE_BILLING" },
    ],
  },
  {
    key: "settings", label: "Settings", icon: Settings, items: [
      { label: "Users", href: "/admin/users", icon: Users, privilege: "MANAGE_USERS" },
      { label: "API keys", href: "/admin/api-keys", icon: KeyRound, privilege: "MANAGE_API_KEYS" },
      { label: "Audit log", href: "/admin/audit", icon: ScrollText, privilege: "VIEW_AUDIT" },
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

/** Active-route matching. Exact match except the Articles list, which also stays
 *  active while editing an article (/admin/articles/[id]) but not on /new. */
export function isItemActive(href: string, pathname: string): boolean {
  if (href === "/admin") {
    return (
      pathname === "/admin" ||
      (pathname.startsWith("/admin/articles/") && pathname !== "/admin/articles/new")
    )
  }
  if (href === "/admin/articles/new") return pathname === "/admin/articles/new"
  return pathname === href
}

export function groupHasActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((it) => isItemActive(it.href, pathname))
}
