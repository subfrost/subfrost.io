import { redirect } from "next/navigation"
import { docsBySlug, docPages } from "@/lib/docs/content"
import { externalLinks } from "@/lib/external-links"

type Props = {
  params: Promise<{ slug: string[] }>
}

function slugFromParams(params: { slug: string[] }) {
  return params.slug.join("/")
}

export function generateStaticParams() {
  return docPages.map((page) => ({ slug: page.slug.split("/") }))
}

export default async function DocPage({ params }: Props) {
  const slug = slugFromParams(await params)
  const page = docsBySlug.get(slug)

  if (slug === "introduction/api-docs" || page?.title.toLowerCase() === "api docs") {
    redirect(externalLinks.apiDocs)
  }

  redirect(page?.sourceUrl ?? externalLinks.docs)
}

