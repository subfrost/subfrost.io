import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { docPages, docSections, docsBySlug, docsForSection, localDocHref, type DocBlock } from "@/lib/docs/content"

type Props = {
  params: Promise<{ slug: string[] }>
}

function slugFromParams(params: { slug: string[] }) {
  return params.slug.join("/")
}

export function generateStaticParams() {
  return docPages.map((page) => ({ slug: page.slug.split("/") }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = docsBySlug.get(slugFromParams(await params))
  if (!page) return {}

  return {
    title: `${page.title} | subfrost docs`,
    description: page.description,
    alternates: {
      canonical: `https://subfrost.io/docs/${page.slug}`,
    },
    openGraph: {
      title: `${page.title} | subfrost docs`,
      description: page.description,
      type: "article",
      url: `https://subfrost.io/docs/${page.slug}`,
      siteName: "subfrost",
    },
  }
}

function renderBlock(block: DocBlock, index: number) {
  if (block.type === "p") return <p key={index}>{block.text}</p>
  if (block.type === "list") {
    return (
      <ul key={index}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }
  if (block.type === "code") {
    return (
      <pre key={index}>
        <code>{block.code}</code>
      </pre>
    )
  }
  return (
    <div key={index} className="overflow-x-auto rounded-[6px] border" style={{ borderColor: "var(--ed-hair)" }}>
      <table className="w-full min-w-[520px] border-collapse text-left sm:min-w-0">
        <tbody>
          {block.rows.map(([key, value]) => (
            <tr key={key} className="border-b last:border-b-0" style={{ borderColor: "var(--ed-hair)" }}>
              <th className="w-[42%] px-4 py-3 font-display text-[14px] font-medium" style={{ color: "var(--ed-ink)" }}>
                {key}
              </th>
              <td className="px-4 py-3 font-display text-[14px]" style={{ color: "var(--ed-body)" }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function DocPage({ params }: Props) {
  const page = docsBySlug.get(slugFromParams(await params))
  if (!page) notFound()

  const currentIndex = docPages.findIndex((item) => item.slug === page.slug)
  const previous = currentIndex > 0 ? docPages[currentIndex - 1] : null
  const next = currentIndex < docPages.length - 1 ? docPages[currentIndex + 1] : null

  return (
    <EditorialShell>
      <main>
        <section>
          <div className="mx-auto max-w-[1440px] px-6 pb-10 pt-12 sm:px-8 sm:pb-20 sm:pt-[104px]">
            <div className="max-w-[880px]">
              <p className="font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                {page.section}
              </p>
              <h1 className="font-display mt-5 text-[42px] font-normal leading-[1.02] sm:text-[72px]" style={{ color: "var(--ed-ink)" }}>
                {page.title}
              </h1>
              <p className="font-display mt-6 max-w-[760px] text-[19px] leading-[1.5] sm:text-[22px]" style={{ color: "var(--ed-body)" }}>
                {page.description}
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto grid max-w-[1440px] gap-10 px-6 pb-16 sm:px-8 sm:pb-24 lg:grid-cols-[260px_minmax(0,760px)_260px]">
            <aside className="hidden lg:block">
              <div className="sticky top-28">
                <a href="/docs" className="font-display text-[14px] font-medium" style={{ color: "var(--ed-ink)" }}>
                  Docs
                </a>
                <div className="mt-7 flex flex-col gap-7">
                  {docSections.map((section) => (
                    <div key={section}>
                      <p className="font-display text-[13px] font-medium" style={{ color: "var(--ed-muted)" }}>
                        {section}
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        {docsForSection(section).map((item) => (
                          <a
                            key={item.slug}
                            href={localDocHref(item.slug)}
                            className="font-display text-[13px] leading-[1.35]"
                            style={{ color: item.slug === page.slug ? "var(--ed-ink)" : "var(--ed-muted)" }}
                          >
                            {item.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <nav className="min-w-0 lg:hidden" aria-label="Docs section">
              <p className="font-display text-[13px] font-medium" style={{ color: "var(--ed-muted)" }}>
                {page.section}
              </p>
              <div className="mt-3 flex max-w-full snap-x gap-3 overflow-x-auto pb-2">
                {docsForSection(page.section).map((item) => (
                  <a
                    key={item.slug}
                    href={localDocHref(item.slug)}
                    className="snap-start whitespace-nowrap rounded-full border px-3 py-1.5 font-display text-[13px]"
                    style={{
                      borderColor: item.slug === page.slug ? "var(--ed-ink)" : "var(--ed-hair)",
                      color: item.slug === page.slug ? "var(--ed-ink)" : "var(--ed-muted)",
                    }}
                  >
                    {item.title}
                  </a>
                ))}
              </div>
              <a
                href={page.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display mt-4 inline-flex items-center text-[13px]"
                style={{ color: "var(--ed-muted)" }}
              >
                Source reviewed
                <ArrowUpRight aria-hidden="true" className="ml-1 h-3.5 w-3.5" strokeWidth={2} />
              </a>
            </nav>

            <article className="ed-article-prose min-w-0">
              {page.blocks.map(renderBlock)}
              <hr />
              <div className="grid gap-4 sm:grid-cols-2">
                {previous ? (
                  <a href={localDocHref(previous.slug)} className="block rounded-[6px] p-4 no-underline" style={{ background: "color-mix(in srgb, var(--ed-surface) 70%, transparent)" }}>
                    <span className="block text-[13px]" style={{ color: "var(--ed-muted)" }}>Previous</span>
                    <span className="mt-1 block" style={{ color: "var(--ed-ink)" }}>{previous.title}</span>
                  </a>
                ) : <span />}
                {next ? (
                  <a href={localDocHref(next.slug)} className="block rounded-[6px] p-4 text-right no-underline" style={{ background: "color-mix(in srgb, var(--ed-surface) 70%, transparent)" }}>
                    <span className="block text-[13px]" style={{ color: "var(--ed-muted)" }}>Next</span>
                    <span className="mt-1 block" style={{ color: "var(--ed-ink)" }}>
                      {next.title}
                      <ArrowRight aria-hidden="true" className="ml-1 inline-block h-[0.82em] w-[0.82em] translate-y-[-0.08em]" strokeWidth={2} />
                    </span>
                  </a>
                ) : null}
              </div>
            </article>

            <aside className="hidden xl:block">
              <div className="sticky top-28">
                <p className="font-display text-[13px] font-medium" style={{ color: "var(--ed-muted)" }}>
                  Source reviewed
                </p>
                <a
                  href={page.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display mt-3 inline-flex items-center text-[14px]"
                  style={{ color: "var(--ed-ink)" }}
                >
                  Original docs
                  <ArrowUpRight aria-hidden="true" className="ml-1 h-3.5 w-3.5" strokeWidth={2} />
                </a>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </EditorialShell>
  )
}
