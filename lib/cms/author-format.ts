import type { CmsLocale } from "@/lib/cms/articles"

/** Joins author names into one display string with a localized conjunction.
 *  en: "A", "A and B", "A, B, and C" (Oxford comma).
 *  zh: "A", "A 和 B", "A、B 和 C". Empty entries are dropped. */
export function formatAuthorNames(names: string[], locale: CmsLocale): string {
  const list = names.filter((n) => n && n.trim())
  if (list.length === 0) return ""
  if (list.length === 1) return list[0]
  const and = locale === "zh" ? " 和 " : " and "
  if (list.length === 2) return list[0] + and + list[1]
  const sep = locale === "zh" ? "、" : ", "
  const head = list.slice(0, -1).join(sep)
  const tail = list[list.length - 1]
  return locale === "zh" ? head + and + tail : head + "," + and + tail
}
