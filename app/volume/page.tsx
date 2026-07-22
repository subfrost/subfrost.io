import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { VolumeChartPanel } from "@/components/VolumeModal"
import { absoluteUrl, sharedUnfurlImageHeight, sharedUnfurlImageUrl, sharedUnfurlImageWidth } from "@/lib/seo"

export const metadata: Metadata = {
  title: "Volume charts | subfrost",
  description: "subfrost protocol volume charts for wrap and unwrap activity across both Alkanes and BRC20.",
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
    description: "subfrost protocol volume charts for wrap and unwrap activity across both Alkanes and BRC20.",
    type: "website",
    url: absoluteUrl("/volume"),
    siteName: "subfrost",
    images: [{ url: sharedUnfurlImageUrl, width: sharedUnfurlImageWidth, height: sharedUnfurlImageHeight, alt: "subfrost" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Volume charts | subfrost",
    description: "subfrost protocol volume charts for wrap and unwrap activity across both Alkanes and BRC20.",
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
        <main className="min-h-[calc(100vh-4rem)] pb-20 pt-5 sm:pt-[33px] lg:pb-24" style={{ background: "var(--ed-canvas)" }}>
          <section className="mx-auto max-w-[1440px] px-6 sm:px-8">
            <div className="mb-7 max-w-[720px]">
              <h1 className="font-display text-[38px] font-normal leading-[1.06] sm:text-[52px]" style={{ color: "var(--ed-ink)" }}>
                {locale === "zh" ? "协议交易量" : "Protocol volume"}
              </h1>
              <p className="font-display mt-4 max-w-[560px] text-[18px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                {locale === "zh"
                  ? "查看 Alkanes 与 BRC20 的包装和解包活动。"
                  : "Wrap and unwrap activity across both Alkanes and BRC20."}
              </p>
            </div>
            <VolumeChartPanel variant="page" />
          </section>
        </main>
      </EditorialShell>
    </>
  )
}
