import Link from "next/link"
import type { Metadata } from "next"
import { getPublishedPreviews, type CmsLocale } from "@/lib/cms/articles"
import { AuthorByline } from "@/components/articles/AuthorByline"
import { CoverArt } from "@/components/articles/CoverArt"
import { SubscribePanel } from "@/components/articles/SubscribePanel"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Articles — SUBFROST",
  description: "Research, releases, and field notes from the SUBFROST team.",
}

export default async function ArticlesIndex({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang } = await searchParams
  const locale: CmsLocale = lang === "zh" ? "zh" : "en"
  const articles = await getPublishedPreviews({ limit: 30, locale })
  const [lead, ...rest] = articles
  const latest = rest.slice(0, 4)

  return (
    <main className="relative overflow-hidden pb-16 pt-8">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--ed-accent) 18%, transparent) 0%, transparent 20%, transparent 80%, color-mix(in srgb, var(--ed-accent) 18%, transparent) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--ed-band) 35%, transparent) 0%, transparent 25%, transparent 78%, color-mix(in srgb, var(--ed-band) 30%, transparent) 100%)",
          }}
        />
        <div
          className="absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--ed-ice) 24%, transparent)" }}
        />
        <div
          className="absolute left-[-120px] top-[28%] h-[360px] w-[360px] rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--ed-accent) 12%, transparent)" }}
        />
        <div
          className="absolute right-[-120px] top-[28%] h-[360px] w-[360px] rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--ed-accent) 12%, transparent)" }}
        />
      </div>

      <div className="relative mx-auto max-w-[1120px] px-6 sm:px-7">
        <section
          className="relative overflow-hidden rounded-[22px] border px-6 py-8 sm:px-9 sm:py-10"
          style={{
            borderColor: "color-mix(in srgb, var(--ed-hair) 76%, var(--ed-accent))",
            background:
              "linear-gradient(150deg, color-mix(in srgb, var(--ed-surface) 84%, var(--ed-accent)) 0%, color-mix(in srgb, var(--ed-surface) 95%, var(--ed-ice)) 50%, var(--ed-surface) 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute -left-16 top-2 h-48 w-48 rounded-full blur-2xl"
            style={{ background: "color-mix(in srgb, var(--ed-ice) 20%, transparent)" }}
          />
          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="ed-eyebrow mb-2">Protocol Updates</p>
              <h1 className="font-display text-[42px] font-semibold leading-[1.04] sm:text-[56px]" style={{ color: "var(--ed-ink)" }}>
                SUBFROST Updates
              </h1>
              <p className="font-reading mt-2 max-w-[720px] text-[18px] sm:text-[21px]" style={{ color: "var(--ed-muted)" }}>
                Weekly progress across releases, research, and live protocol operations.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-right sm:min-w-[250px]">
              <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--ed-hair)", background: "color-mix(in srgb, var(--ed-canvas) 78%, transparent)" }}>
                <p className="font-reading text-[11px] uppercase tracking-[1.2px]" style={{ color: "var(--ed-muted)" }}>Updates</p>
                <p className="font-display text-[25px] font-semibold" style={{ color: "var(--ed-ink)" }}>{articles.length}</p>
              </div>
              <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--ed-hair)", background: "color-mix(in srgb, var(--ed-canvas) 78%, transparent)" }}>
                <p className="font-reading text-[11px] uppercase tracking-[1.2px]" style={{ color: "var(--ed-muted)" }}>Cadence</p>
                <p className="font-display text-[22px] font-semibold" style={{ color: "var(--ed-ink)" }}>Weekly</p>
              </div>
            </div>
          </div>
        </section>

        {articles.length === 0 ? (
          <div className="mt-10 space-y-8">
            <div
              className="font-reading rounded-2xl border border-dashed p-16 text-center text-[17px]"
              style={{ borderColor: "var(--ed-hair)", color: "var(--ed-muted)" }}
            >
              No updates published yet.
            </div>
            <SubscribePanel locale={locale} />
          </div>
        ) : (
          <>
            {lead ? (
              <section className="mt-10 grid gap-8 xl:grid-cols-[1.45fr_1fr] xl:items-start">
                <Link
                  href={`/articles/${lead.slug}`}
                  className="group overflow-hidden rounded-[18px] border p-4 sm:p-5"
                  style={{ borderColor: "var(--ed-hair)", background: "color-mix(in srgb, var(--ed-surface) 85%, transparent)" }}
                >
                  <div className="grid items-center gap-7 md:grid-cols-[1.15fr_1fr]">
                    {lead.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={lead.coverImage} alt="" className="h-[290px] w-full rounded-[14px] object-cover" />
                    ) : (
                      <CoverArt label={lead.tags[0]?.name} className="h-[290px] rounded-[14px]" />
                    )}
                    <div>
                      <div className="ed-eyebrow ed-eyebrow--lead mb-3">Featured Update</div>
                      <h2
                        className="font-display text-[31px] font-semibold leading-[1.1] transition-opacity group-hover:opacity-80 sm:text-[39px]"
                        style={{ color: "var(--ed-ink)" }}
                      >
                        {lead.title}
                      </h2>
                      <p className="font-reading mb-5 mt-3 text-[18px] leading-[1.5]" style={{ color: "var(--ed-muted)" }}>
                        {lead.excerpt}
                      </p>
                      <AuthorByline
                        author={lead.author}
                        publishedAt={lead.publishedAt}
                        readingMinutes={lead.readingMinutes}
                        size={40}
                        variant="compact"
                        linkAuthor={false}
                      />
                    </div>
                  </div>
                </Link>

                <aside className="rounded-[18px] border p-5 sm:p-6" style={{ borderColor: "var(--ed-hair)", background: "color-mix(in srgb, var(--ed-surface) 85%, transparent)" }}>
                  <p className="ed-eyebrow mb-3">Recent Signals</p>
                  <div className="space-y-5">
                    {latest.length > 0 ? (
                      latest.map((a) => (
                        <Link key={a.slug} href={`/articles/${a.slug}`} className="group block border-b pb-4 last:border-b-0 last:pb-0" style={{ borderColor: "var(--ed-hair)" }}>
                          <h3 className="font-display text-[19px] leading-[1.25] transition-opacity group-hover:opacity-80" style={{ color: "var(--ed-ink)" }}>
                            {a.title}
                          </h3>
                          <p className="font-reading mt-1 line-clamp-2 text-[14px]" style={{ color: "var(--ed-muted)" }}>
                            {a.excerpt}
                          </p>
                        </Link>
                      ))
                    ) : (
                      <p className="font-reading text-[15px]" style={{ color: "var(--ed-muted)" }}>
                        More updates coming soon.
                      </p>
                    )}
                  </div>
                </aside>
              </section>
            ) : null}

            <section className="mt-12">
              <SubscribePanel locale={locale} />
            </section>
          </>
        )}
      </div>
    </main>
  )
}
