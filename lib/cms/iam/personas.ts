// Convenience persona presets for the user editor: named bundles of privileges
// surfaced as one-click buttons next to the PrivilegePicker. Pure data + pure
// helpers (no React) so they're testable and reusable. The actual capability
// model and enforcement live in the registry + server actions — a persona is
// just a shortcut for selecting privilege codes.

import { expand, type PrivilegeCode } from "@/lib/cms/iam/registry"

export interface Persona {
  key: string
  label: string
  description: string
  privileges: PrivilegeCode[]
}

export const PERSONAS: Persona[] = [
  {
    key: "articles_editor",
    label: "Articles editor",
    description: "Edits only their own articles.",
    privileges: ["articles.write"],
  },
  {
    key: "articles_superuser",
    label: "Articles superuser",
    description: "Manages and edits any author's articles.",
    privileges: ["articles.edit_any"],
  },
]

/** Privileges a persona effectively grants (closed over the implies graph). */
function personaCodes(persona: Persona): PrivilegeCode[] {
  return expand(persona.privileges)
}

/** Merge a persona's privileges into a current selection: additive union of the
 *  implies-expanded codes (capped to `grantable`) with `current`, de-duped. */
export function applyPersona(current: string[], persona: Persona, grantable: string[]): PrivilegeCode[] {
  const grant = new Set(grantable)
  const add = personaCodes(persona).filter((c) => grant.has(c))
  return [...new Set([...current, ...add])]
}

/** True iff every privilege the persona grants is within `grantable` (you can't
 *  grant what you don't hold). Drives the button's disabled state. */
export function personaGrantable(persona: Persona, grantable: string[]): boolean {
  const grant = new Set(grantable)
  return personaCodes(persona).every((c) => grant.has(c))
}
