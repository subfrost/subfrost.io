"use client"

import type React from "react"
import { useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import CustomModal from "./CustomModal"
import { trackEvent } from "@/lib/analytics"
import { useTranslation } from "@/hooks/useTranslation"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const Footer: React.FC = () => {
  const { t } = useTranslation()
  const [tosOpen, setTosOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  return (
    <>
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
                    href="https://docs.subfrost.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("official_docs_click", { event_category: "navigation", event_label: "footer" })}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t("footer.documentation")}
                  </a>
                </li>
                <li>
                  <a
                    href="https://api.subfrost.io/docs"
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
                    href="https://api.subfrost.io"
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
                    href="https://x.com/SUBFROSTio"
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
                    href="https://discord.gg/WNWUPtjRNS"
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
                          href="https://x.com/SUBFROSTio/"
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
                  <button
                    onClick={() => { trackEvent("tos_open", { event_category: "legal", event_label: "footer" }); setTosOpen(true); }}
                    className="text-sm text-gray-400 hover:text-white transition-colors focus:outline-none text-left"
                  >
                    {t("footer.terms")}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { trackEvent("privacy_open", { event_category: "legal", event_label: "footer" }); setPrivacyOpen(true); }}
                    className="text-sm text-gray-400 hover:text-white transition-colors focus:outline-none text-left"
                  >
                    {t("footer.privacy")}
                  </button>
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

      <CustomModal
        isOpen={tosOpen}
        onClose={() => setTosOpen(false)}
        title={t("footer.terms")}
        modalClassName="mb-32"
      >
        <div className={cn("text-xs space-y-6 uppercase font-bold")}>
          <p className="text-sm font-bold">LAST UPDATED: JANUARY 7, 2026</p>

          <section>
            <h2 className="text-sm font-bold mb-2">1. ACCEPTANCE OF TERMS</h2>
            <p>
              BY ACCESSING OR USING SERVICES PROVIDED BY SUBZERO RESEARCH INC. ("WE," "OUR," OR "US"), YOU AGREE TO BE
              BOUND BY THESE TERMS OF SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">2. ASSUMPTION OF RISK</h2>
            <p>YOU UNDERSTAND AND AGREE THAT:</p>
            <ul className="list-disc pl-4 mt-2 space-y-2">
              <li>
                THE USE OF OUR SERVICES INVOLVES INHERENT RISKS ASSOCIATED WITH CRYPTOCURRENCY, SMART CONTRACTS, AND
                BLOCKCHAIN TECHNOLOGY.
              </li>
              <li>WE CANNOT GUARANTEE THE SECURITY OF ANY BLOCKCHAIN NETWORK OR SMART CONTRACT.</li>
              <li>YOU ARE SOLELY RESPONSIBLE FOR MAINTAINING THE SECURITY OF YOUR PRIVATE KEYS AND WALLETS.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">3. DISCLAIMER OF WARRANTIES</h2>
            <p>
              OUR SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR
              IMPLIED. SUBZERO RESEARCH INC. DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-4 mt-2 space-y-2">
              <li>MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE</li>
              <li>ACCURACY, RELIABILITY, OR COMPLETENESS OF THE SERVICES</li>
              <li>UNINTERRUPTED OR ERROR-FREE OPERATION</li>
              <li>SECURITY AGAINST UNAUTHORIZED ACCESS</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">4. LIMITATION OF LIABILITY</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SUBZERO RESEARCH INC. SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR
              CRYPTOCURRENCY ASSETS.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">5. MODIFICATIONS</h2>
            <p>
              WE RESERVE THE RIGHT TO MODIFY OR DISCONTINUE OUR SERVICES AT ANY TIME WITHOUT NOTICE. WE MAY ALSO REVISE
              THESE TERMS OF SERVICE FROM TIME TO TIME.
            </p>
          </section>
        </div>
      </CustomModal>

      <CustomModal
        isOpen={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title={t("footer.privacy")}
        modalClassName="mb-32"
      >
        <div className={cn("text-xs space-y-6 uppercase font-bold")}>
          <p className="text-sm font-bold">LAST UPDATED: JANUARY 7, 2026</p>

          <section>
            <h2 className="text-sm font-bold mb-2">1. INTRODUCTION</h2>
            <p>
              AT SUBZERO RESEARCH INC., WE ARE COMMITTED TO PROTECTING YOUR PRIVACY AND ENSURING THE SECURITY OF ANY
              INFORMATION RELATED TO YOUR USE OF OUR SERVICES.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">2. NO COLLECTION POLICY</h2>
            <p>WE MAINTAIN A STRICT NO-COLLECTION POLICY:</p>
            <ul className="list-disc pl-4 mt-2 space-y-2">
              <li>WE DO NOT COLLECT OR STORE ANY PERSONAL INFORMATION</li>
              <li>WE DO NOT USE COOKIES OR TRACKING TECHNOLOGIES</li>
              <li>WE DO NOT MAINTAIN USER ACCOUNTS OR PROFILES</li>
              <li>WE DO not TRACK OR STORE TRANSACTION DATA</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">3. BLOCKCHAIN DATA</h2>
            <p>
              PLEASE BE AWARE THAT WHILE WE DO NOT COLLECT DATA, ANY TRANSACTIONS YOU MAKE ON THE BLOCKCHAIN ARE
              PUBLICLY VISIBLE AS PART OF THE BLOCKCHAIN'S INHERENT TRANSPARENCY.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">4. THIRD-PARTY SERVICES</h2>
            <p>
              OUR SERVICES MAY INTERACT WITH THIRD-PARTY BLOCKCHAIN NETWORKS AND PROTOCOLS. WE DO NOT CONTROL AND ARE
              NOT RESPONSIBLE FOR ANY INFORMATION THAT MAY BE COLLECTED BY THESE THIRD PARTIES.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">5. CONTACT</h2>
            <p>
              FOR PRIVACY-RELATED INQUIRIES, YOU MAY CONTACT US THROUGH OUR OFFICIAL COMMUNICATION CHANNELS WHILE
              MAINTAINING YOUR ANONYMITY.
            </p>
          </section>
        </div>
      </CustomModal>
    </>
  )
}

export default Footer
