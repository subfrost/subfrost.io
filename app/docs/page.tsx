import type { Metadata } from "next"
import { ArrowRight } from "lucide-react"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { CoverArt } from "@/components/articles/CoverArt"
import { docPages, docSections, docsForSection, localDocHref } from "@/lib/docs/content"
import { absoluteUrl, siteName, siteUrl } from "@/lib/seo"

export const metadata: Metadata = {
  title: "Docs | subfrost",
  description: "First-party subfrost docs for Bitcoin-native infrastructure, app surfaces, tokens, developer integrations, networking, and reference material.",
  alternates: {
    canonical: "https://subfrost.io/docs",
  },
  openGraph: {
    title: "Docs | subfrost",
    description: "First-party subfrost docs for Bitcoin-native infrastructure, app surfaces, tokens, developer integrations, networking, and reference material.",
    type: "website",
    url: "https://subfrost.io/docs",
    siteName: "subfrost",
  },
}

export default function DocsIndexPage() {
  const featured = docPages.slice(0, 3)
  const docsJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "subfrost docs",
    description: metadata.description,
    url: absoluteUrl("/docs"),
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: docPages.map((page, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(localDocHref(page.slug)),
        name: page.title,
        description: page.description,
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(docsJsonLd) }}
      />
      <EditorialShell>
        <main>
        <section>
          <div className="mx-auto grid max-w-[1440px] gap-8 px-6 pb-14 pt-12 sm:px-8 sm:gap-10 sm:pb-24 sm:pt-[104px] lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:items-end">
            <div className="min-w-0">
              <h1 className="font-display text-[48px] font-normal leading-none sm:text-[76px]" style={{ color: "var(--ed-ink)" }}>
                Docs
              </h1>
              <p className="font-display mt-6 max-w-[720px] text-[20px] leading-[1.45] sm:text-[24px]" style={{ color: "var(--ed-body)" }}>
                Technical references, product guides, token mechanics, and network architecture for building with subfrost.
              </p>
            </div>
            <CoverArt
              variant={4}
              priority
              sizes="(min-width: 1024px) 44vw, 100vw"
              className="ed-cover-frame aspect-[16/10]"
            />
          </div>
        </section>

        <section>
          <div className="mx-auto grid max-w-[1440px] gap-9 px-6 pb-20 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-[32px] font-medium leading-tight" style={{ color: "var(--ed-ink)" }}>
                Start here
              </h2>
              <p className="font-display mt-4 text-[17px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                The old docs are now represented as a repo-owned, designed experience.
              </p>
            </div>
            <div className="grid gap-9 sm:grid-cols-2 xl:grid-cols-3">
              {featured.map((page, index) => (
                <a key={page.slug} href={localDocHref(page.slug)} className="ed-card">
                  <CoverArt variant={index + 5} sizes="(min-width: 768px) 28vw, 100vw" className="ed-cover-frame aspect-[4/3]" />
                  <div className="pt-5">
                    <h3 className="font-display text-[22px] font-normal leading-tight" style={{ color: "var(--ed-ink)" }}>
                      {page.title}
                      <ArrowRight aria-hidden="true" className="ml-1 inline-block h-[0.82em] w-[0.82em] translate-y-[-0.08em]" strokeWidth={2} />
                    </h3>
                    <p className="font-display mt-3 text-[15px] leading-[1.48]" style={{ color: "var(--ed-body)" }}>
                      {page.description}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto grid max-w-[1440px] gap-10 px-6 pb-20 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-[32px] font-medium leading-tight" style={{ color: "var(--ed-ink)" }}>
                All docs
              </h2>
            </div>
            <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
              {docSections.map((section) => (
                <div key={section}>
                  <h3 className="font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                    {section}
                  </h3>
                  <div className="mt-5 flex flex-col gap-4">
                    {docsForSection(section).map((page) => (
                      <a key={page.slug} href={localDocHref(page.slug)} className="group">
                        <span className="font-display text-[18px] leading-tight" style={{ color: "var(--ed-ink)" }}>
                          {page.title}
                          <ArrowRight aria-hidden="true" className="ml-1 inline-block h-[0.72em] w-[0.72em] translate-y-[-0.07em]" strokeWidth={2} />
                        </span>
                        <span className="font-display mt-1 block text-[14px] leading-[1.45]" style={{ color: "var(--ed-muted)" }}>
                          {page.description}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        </main>
      </EditorialShell>
    </>
  )
}
