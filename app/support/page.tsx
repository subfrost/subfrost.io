import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import GlobalStyles from "@/components/GlobalStyles"
import InfoSection from "@/components/InfoSection"

export const metadata: Metadata = {
  title: "Support | SUBFROST",
  description: "Get help with SUBFROST. Contact our support team at support@subfrost.io.",
  alternates: {
    canonical: "https://subfrost.io/support",
  },
  openGraph: {
    title: "Support | SUBFROST",
    description: "Get help with SUBFROST. Contact our support team at support@subfrost.io.",
    type: "website",
    url: "https://subfrost.io/support",
    siteName: "SUBFROST",
  },
}

export default function SupportPage() {
  return (
    <main className="relative">
      <GlobalStyles />
      <InfoSection>
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <header className="mb-12 border-b border-slate-300/20 pb-8">
            <Link href="/" className="mb-8 inline-flex items-center">
              <Image
                src="/brand/subfrost-wordmark.svg"
                alt="SUBFROST"
                width={180}
                height={24}
                priority
                className="h-8 w-auto hover:opacity-80 sf-wordmark"
              />
            </Link>
            <h1 className="text-3xl font-bold uppercase tracking-wider text-white snow-title-no-filter md:text-4xl">
              Support
            </h1>
          </header>

          {/* Body */}
          <article className="space-y-6 leading-relaxed text-gray-300">
            <p>
              Need help with SUBFROST? Reach out to our team and we&apos;ll get back to you.
            </p>

            <p className="text-lg">
              Contact us at{" "}
              <a
                href="mailto:support@subfrost.io"
                className="font-semibold text-blue-300 underline hover:opacity-80"
              >
                support@subfrost.io
              </a>
            </p>
          </article>

          {/* Footer */}
          <footer className="mt-16 border-t border-slate-300/20 pt-8">
            <Link href="/" className="text-sm text-blue-300 underline hover:opacity-80">
              ← Back to subfrost.io
            </Link>
          </footer>
        </div>
      </InfoSection>
    </main>
  )
}
