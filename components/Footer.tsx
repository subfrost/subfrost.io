"use client"

import type React from "react"
import Image from "next/image"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"
import { useTranslation } from "@/hooks/useTranslation"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { externalLinks } from "@/lib/external-links"

const Footer: React.FC = () => {
  const { t } = useTranslation()

  return (
    <footer className="w-full bg-[#060d1a] border-t border-white/10 text-gray-400">
        {/* Main footer content */}
        <div className="max-w-7xl mx-auto px-12 md:px-8 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
            {/* Brand column */}
            <div className="md:col-span-1">
              <div className="mb-3">
                <Image
                  src="/brand/subfrost-wordmark.svg"
                  alt="SUBFROST wordmark"
                  width={180}
                  height={24}
                  className="h-8 w-auto sf-wordmark"
                />
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                {t("footer.tagline")}
              </p>
              <p className="text-xs text-gray-600 mt-4">{t("footer.bySubzero")}</p>
            </div>

            {/* Link columns wrapper: 3-col grid on all sizes, contents on md+ so they flow into the outer 4-col grid */}
            <div className="grid grid-cols-3 gap-6 md:contents">
            {/* Product column */}
            <div>
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest mb-4">{t("footer.product")}</h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="https://app.subfrost.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("launch_app_click", { event_category: "cta", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.launchApp")}
                  </a>
                </li>
                <li>
                  <a
                    href={externalLinks.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("official_docs_click", { event_category: "navigation", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.documentation")}
                  </a>
                </li>
                <li>
                  <Link
                    href="/articles"
                    onClick={() => trackEvent("blog_click", { event_category: "navigation", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.blog")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/ecosystem"
                    onClick={() => trackEvent("ecosystem_click", { event_category: "navigation", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Ecosystem
                  </Link>
                </li>
                <li>
                  <a
                    href={externalLinks.apiDocs}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("api_docs_click", { event_category: "navigation", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.apiReference")}
                  </a>
                </li>
                <li>
                  <a
                    href={externalLinks.apiLogin}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("api_login_click", { event_category: "navigation", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.apiLogin")}
                  </a>
                </li>
              </ul>
            </div>

            {/* Community column */}
            <div>
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest mb-4">{t("footer.community")}</h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="https://x.com/gabe_subfrost"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("social_x_click", { event_category: "social", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.xTwitter")}
                  </a>
                </li>
                <li>
                  <a
                    href="https://discord.gg/qrWgJgNAUj"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("social_discord_click", { event_category: "social", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.discord")}
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/subfrost"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("social_github_click", { event_category: "social", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.github")}
                  </a>
                </li>
                <li>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-sm text-gray-400 hover:text-white transition-colors focus:outline-none text-left"
                      >
                        {t("footer.contactUs")}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto">
                      <div className="flex flex-col gap-2 text-sm">
                        <a
                          href="mailto:inquiries@subfrost.io"
                          className="text-[#284372] hover:underline"
                        >
                          {t("footer.emailUs")}
                        </a>
                        <a
                          href="https://x.com/gabe_subfrost/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#284372] hover:underline"
                        >
                          {t("footer.messageOnX")}
                        </a>
                      </div>
                    </PopoverContent>
                  </Popover>
                </li>
              </ul>
            </div>

            {/* Legal column */}
            <div>
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest mb-4">{t("footer.legal")}</h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/terms"
                    onClick={() => trackEvent("tos_open", { event_category: "legal", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.terms")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    onClick={() => trackEvent("privacy_open", { event_category: "legal", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.privacy")}
                  </Link>
                </li>
              </ul>
            </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5 px-12 md:px-8 py-4">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
            <p>{t("footer.copyright")}</p>
            <p className="text-gray-700 text-[0.65rem] tracking-wide uppercase">{t("footer.disclaimer")}</p>
          </div>
        </div>
      </footer>
  )
}

export default Footer
