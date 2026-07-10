"use client"

import {
  UserCog, FileText, Megaphone, Scale, CreditCard, Banknote, KeyRound, ScrollText, Shield, FolderOpen, TrendingUp, KanbanSquare, Gavel, Boxes,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { CategoryKey } from "@/lib/cms/iam/registry"

export const CATEGORY_ICON: Record<CategoryKey, LucideIcon> = {
  iam: UserCog,
  articles: FileText,
  tasks: KanbanSquare,
  community: Megaphone,
  compliance: Scale,
  billing: CreditCard,
  financials: Banknote,
  legal: Gavel,
  files: FolderOpen,
  marketing: TrendingUp,
  ecosystem: Boxes,
  system: Megaphone,
  apikeys: KeyRound,
  audit: ScrollText,
}

export function categoryIcon(key: CategoryKey): LucideIcon {
  return CATEGORY_ICON[key] ?? Shield
}
