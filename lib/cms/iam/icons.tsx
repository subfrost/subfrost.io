"use client"

import {
  UserCog, FileText, Megaphone, Scale, CreditCard, KeyRound, ScrollText, Shield,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { CategoryKey } from "@/lib/cms/iam/registry"

export const CATEGORY_ICON: Record<CategoryKey, LucideIcon> = {
  iam: UserCog,
  articles: FileText,
  community: Megaphone,
  compliance: Scale,
  billing: CreditCard,
  apikeys: KeyRound,
  audit: ScrollText,
}

export function categoryIcon(key: CategoryKey): LucideIcon {
  return CATEGORY_ICON[key] ?? Shield
}
