import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import GlobalStyles from "@/components/GlobalStyles"
import InfoSection from "@/components/InfoSection"

export const metadata: Metadata = {
  title: "Terms of Service | SUBFROST",
  description:
    "Terms of Service for the SUBFROST self-custodial Bitcoin and alkanes wallet — browser extension and iOS and Android apps — operated by Subzero Research Inc.",
  alternates: {
    canonical: "https://subfrost.io/terms",
  },
  openGraph: {
    title: "Terms of Service | SUBFROST",
    description:
      "Terms of Service for the SUBFROST self-custodial Bitcoin and alkanes wallet — browser extension and iOS and Android apps — operated by Subzero Research Inc.",
    type: "website",
    url: "https://subfrost.io/terms",
    siteName: "SUBFROST",
  },
}

export default function TermsOfServicePage() {
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
              Terms of Service
            </h1>
            <p className="mt-3 text-sm text-gray-400">Last updated: June 19, 2026</p>
          </header>

          {/* Body */}
          <article className="space-y-8 leading-relaxed text-gray-300">
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of SUBFROST, a
              self-custodial Bitcoin and alkanes wallet provided by Subzero Research Inc.
              (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) as a browser extension and as
              mobile apps for iOS and Android (together, the &ldquo;Services&rdquo;). By accessing or
              using the Services, you agree to be bound by these Terms.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">1. Acceptance of terms</h2>
              <p>
                By downloading, installing, or using the Services, you agree to these Terms and to our{" "}
                <Link href="/privacy" className="text-blue-300 underline hover:opacity-80">
                  Privacy Policy
                </Link>
                . If you do not agree, do not use the Services.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">2. Self-custodial wallet</h2>
              <p>
                SUBFROST is self-custodial. Your recovery phrase, private keys, and PIN are generated
                and stored only on your device, and all signing happens on your device. We never take
                custody of your assets, never receive your keys, and cannot move, freeze, or recover
                your funds. You are solely responsible for safeguarding your recovery phrase and
                device. If you lose your recovery phrase, your funds cannot be recovered by anyone,
                including us.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">3. Eligibility</h2>
              <p>
                You must be at least 13 years old (or the minimum age of digital consent in your
                jurisdiction) to use the Services, and old enough to enter into a binding contract
                where required for paid or regulated features. You are responsible for ensuring that
                your use of the Services is lawful in your jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">4. Optional features</h2>
              <p>
                Certain features are optional, off by default, and may be limited to specific regions
                or platforms. These include cross-chain swaps (routed through a third-party exchange
                provider) and <strong>SUBFROST Pay</strong>, a regulated service that lets you convert
                frBTC to fiat on a virtual card. SUBFROST Pay is provided together with our payment and
                identity-verification partner (Stripe) and requires identity verification (KYC/AML) and
                acceptance of any additional partner terms. Information collected for these features is
                described in our{" "}
                <Link href="/privacy" className="text-blue-300 underline hover:opacity-80">
                  Privacy Policy
                </Link>
                . If you do not use a given feature, its terms and data collection do not apply to you.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">5. Assumption of risk</h2>
              <p>You understand and agree that:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  Use of the Services involves inherent risks associated with cryptocurrency, smart
                  contracts, and blockchain technology, including volatility and total loss of value.
                </li>
                <li>
                  We cannot guarantee the security of any blockchain network or smart contract, and
                  blockchain transactions are generally irreversible.
                </li>
                <li>
                  You are solely responsible for maintaining the security of your private keys,
                  recovery phrase, and devices, and for every transaction you approve.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">6. Disclaimer of warranties</h2>
              <p>
                The Services are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
                warranties of any kind, whether express or implied. To the maximum extent permitted by
                law, Subzero Research Inc. disclaims all warranties, including but not limited to
                merchantability and fitness for a particular purpose; accuracy, reliability, or
                completeness of the Services; uninterrupted or error-free operation; and security
                against unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">7. Limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, Subzero Research Inc. shall not be liable for
                any indirect, incidental, special, consequential, or punitive damages, including loss
                of profits, data, or cryptocurrency assets, arising from or related to your use of the
                Services.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">8. Third-party services</h2>
              <p>
                The Services may interact with third-party blockchain networks, protocols, and
                providers (such as Stripe for SUBFROST Pay and SimpleSwap for cross-chain swaps). We do
                not control and are not responsible for third-party services, and your use of them may
                be subject to their own terms and privacy policies.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">9. Modifications</h2>
              <p>
                We reserve the right to modify or discontinue the Services at any time. We may also
                revise these Terms from time to time; material changes will be posted at this URL with
                a new &ldquo;last updated&rdquo; date. Your continued use of the Services after changes
                take effect constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">10. Contact</h2>
              <p>
                Subzero Research Inc. —{" "}
                <a
                  href="mailto:support@subfrost.io"
                  className="text-blue-300 underline hover:opacity-80"
                >
                  support@subfrost.io
                </a>{" "}
                —{" "}
                <a href="https://subfrost.io" className="text-blue-300 underline hover:opacity-80">
                  https://subfrost.io
                </a>
              </p>
            </section>
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
