// Client-safe path helpers for the Files explorer. Kept separate from
// lib/files/manager.ts (which imports prisma) so client components can import
// path building without pulling server-only code into the browser bundle.

/** Build a /admin/files path from a drive slug + a chain of folder/file slugs. */
export function filesPath(driveSlug: string, slugs: string[] = []): string {
  return ["/admin/files", driveSlug, ...slugs].filter(Boolean).join("/")
}
