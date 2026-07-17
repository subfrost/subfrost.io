import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireScope, fail } from "@/lib/cms/api-route"
import { currentUser } from "@/lib/cms/authz"
import { downloadObject } from "@/lib/files/store"
import { renderMarkdownPdf } from "@/lib/pdf/markdown-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Accept EITHER a Bearer API key (the `subfrost` CLI) OR a logged-in admin
 *  cookie session (the in-browser "Open as PDF" button, which can't attach an
 *  Authorization header via window.open). Both require the files.read scope. */
async function authorize(req: NextRequest): Promise<NextResponse | null> {
  if (req.headers.get("authorization")) {
    const actor = await requireScope(req, "files.read")
    return actor instanceof NextResponse ? actor : null
  }
  const user = await currentUser()
  if (!user) return fail("Not authenticated", 401)
  if (!user.privileges.includes("files.read")) return fail("Insufficient scope: requires 'files.read'", 403)
  return null
}

// GET /api/v1/files/:id/pdf — render a (markdown) file to a printable PDF and
// stream it inline as application/pdf, so opening the URL in a new tab shows a
// print/save-ready document. Gated on files.read like the other v1 file routes.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await authorize(req)
  if (denied) return denied
  try {
    const { id } = await ctx.params
    const file = await prisma.driveFile.findUnique({
      where: { id },
      select: { name: true, gcsObject: true },
    })
    if (!file) return fail("File not found", 404)

    const bytes = await downloadObject(file.gcsObject)
    const markdown = bytes.toString("utf8")
    const title = file.name.replace(/\.(md|markdown|txt)$/i, "")
    const pdf = await renderMarkdownPdf(markdown, { title })

    const pdfName = `${title || "document"}.pdf`.replace(/[^a-z0-9.\-_ ]/gi, "_")
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdfName}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return fail("Could not render PDF", 500)
  }
}
