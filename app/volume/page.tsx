import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { VolumeChartPanel } from "@/components/VolumeModal"
import { absoluteUrl, sharedUnfurlImageHeight, sharedUnfurlImageUrl, sharedUnfurlImageWidth } from "@/lib/seo"

export const metadata: Metadata = {
  title: "Volume charts | subfrost",
  description: "subfrost protocol volume charts for wrap and unwrap activity across Both, Alkanes, and BRC2.0 sources.",
  alternates: {
    canonical: absoluteUrl("/volume"),
    languages: {
      en: absoluteUrl("/volume"),
      zh: absoluteUrl("/volume?lang=zh"),
      "x-default": absoluteUrl("/volume"),
    },
  },
  openGraph: {
    title: "Volume charts | subfrost",
    description: "subfrost protocol volume charts for wrap and unwrap activity across Both, Alkanes, and BRC2.0 sources.",
    type: "website",
    url: absoluteUrl("/volume"),
    siteName: "subfrost",
    images: [{ url: sharedUnfurlImageUrl, width: sharedUnfurlImageWidth, height: sharedUnfurlImageHeight, alt: "subfrost" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Volume charts | subfrost",
    description: "subfrost protocol volume charts for wrap and unwrap activity across Both, Alkanes, and BRC2.0 sources.",
    images: [{ url: sharedUnfurlImageUrl, alt: "subfrost" }],
  },
}

export default async function VolumePage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const locale = params.lang === "zh" ? "zh" : "en"
  const volumeJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "subfrost volume charts",
    description: metadata.description,
    url: absoluteUrl("/volume"),
    isPartOf: {
      "@type": "WebSite",
      name: "SUBFROST",
      url: absoluteUrl("/"),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(volumeJsonLd) }}
      />
      <EditorialShell>
        <main className="min-h-[calc(100vh-4rem)] px-6 pb-20 pt-[60px] sm:px-8 lg:pb-24 lg:pt-[72px]" style={{ background: "var(--ed-canvas)" }}>
          <section className="mx-auto max-w-[1120px]">
            <div className="mb-8 max-w-[720px]">
              <p className="font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                {locale === "zh" ? "交易量" : "Volume"}
              </p>
              <h1 className="mt-8 font-display text-[48px] font-normal leading-[0.98] tracking-normal sm:text-[72px]" style={{ color: "var(--ed-ink)" }}>
                {locale === "zh" ? "协议交易量" : "Protocol volume"}
              </h1>
              <p className="mt-5 max-w-[560px] text-[17px] leading-[1.5]" style={{ color: "var(--ed-muted)" }}>
                {locale === "zh"
                  ? "查看 Both、Alkanes 与 BRC2.0 来源的包装和解包活动。"
                  : "Wrap and unwrap activity across Both, Alkanes, and BRC2.0 sources."}
              </p>
            </div>
            <VolumeChartPanel variant="page" />
          </section>
        </main>
      </EditorialShell>
    </>
  )
}
