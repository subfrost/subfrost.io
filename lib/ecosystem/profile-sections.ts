// lib/ecosystem/profile-sections.ts
/**
 * Splits a profile markdown body into an intro (before the first H2) and one
 * section per `## ` heading — the unit the profile page renders as tabs.
 * Fence-aware: `##` lines inside ``` / ~~~ code fences never open a section.
 */
export interface ProfileSection {
  title: string
  body: string
}

export function splitProfileSections(md: string): { intro: string; sections: ProfileSection[] } {
  const lines = md.split(/\r?\n/)
  const intro: string[] = []
  const sections: ProfileSection[] = []
  let current: { title: string; body: string[] } | null = null
  let inFence = false

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && /^## /.test(line)) {
      if (current) sections.push({ title: current.title, body: current.body.join("\n").trim() })
      current = { title: line.slice(3).trim(), body: [] }
      continue
    }
    if (current) current.body.push(line)
    else intro.push(line)
  }
  if (current) sections.push({ title: current.title, body: current.body.join("\n").trim() })

  return { intro: intro.join("\n").trim(), sections }
}
