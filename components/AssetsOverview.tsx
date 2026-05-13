/**
 * @file components/AssetsOverview.tsx
 * @description Visual overview of Subfrost native assets with ICO-era SVG graphics
 */
"use client"

import React from "react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { useTranslation } from "@/hooks/useTranslation"

interface Asset {
  symbolKey: string
  symbolFallback: string
  nameKey: string
  descKey: string
  icon: string
  hoverIcon?: string
  icons?: { icon: string; hoverIcon?: string }[]
  color: string
  badgeKey?: string
}

const assets: Asset[] = [
  {
    symbolKey: "assets.frbtc.symbol",
    symbolFallback: "frBTC",
    nameKey: "assets.frbtc.name",
    descKey: "assets.frbtc.description",
    icon: "/btc_empty.svg",
    hoverIcon: "/btc_snowflake.svg",
    color: "from-amber-500 to-orange-600",
    badgeKey: "assets.live"
  },
  {
    symbolKey: "assets.frusd.symbol",
    symbolFallback: "frUSD",
    nameKey: "assets.frusd.name",
    descKey: "assets.frusd.description",
    icon: "/usdt_empty.svg",
    hoverIcon: "/usdt_snowflake.svg",
    color: "from-green-500 to-green-700"
  },
  {
    symbolKey: "assets.others.symbol",
    symbolFallback: "Other Majors",
    nameKey: "assets.others.name",
    descKey: "assets.others.description",
    icon: "",
    icons: [
      { icon: "/eth_empty.svg", hoverIcon: "/eth_snowflake.svg" },
      { icon: "/zec_empty.svg", hoverIcon: "/zec_snowflake.svg" }
    ],
    color: "from-purple-500 to-yellow-500"
  }
]

export default function AssetsOverview() {
  const { t } = useTranslation()
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter mb-4">
          {t("assets.heading")}
        </h3>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          {t("assets.description")}
        </p>
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {assets.map((asset, index) => (
          <div
            key={index}
            className={cn(
              "group relative rounded-2xl p-6 transition-all duration-500",
              "bg-gradient-to-br from-slate-800/60 to-slate-900/60",
              "shadow-lg shadow-black/20",
              "before:absolute before:inset-x-0 before:top-0 before:h-4 before:rounded-t-2xl before:border-t before:border-l before:border-r before:border-white/10 before:pointer-events-none before:[mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]",
              "backdrop-blur-sm",
              "hover:shadow-2xl"
            )}
          >
            {/* Badge */}
            {asset.badgeKey && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-xs font-bold text-white shadow-lg">
                {t(asset.badgeKey)}
              </div>
            )}

            {/* Animated glow background */}
            <div className={cn(
              "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500",
              "bg-gradient-to-br",
              asset.color,
              "blur-md"
            )} />

            {/* Icon */}
            <div className="w-28 h-28 mx-auto mb-4 flex items-center justify-center relative">
              {asset.icons ? (
                <div className="flex items-center justify-center gap-2">
                  {asset.icons.map((iconSet, i) => (
                    <div key={i} className="relative w-12 h-12">
                      <Image
                        src={iconSet.icon}
                        alt={`${asset.symbolFallback} Icon ${i + 1}`}
                        width={48}
                        height={48}
                        className={cn(
                          "transition-opacity duration-300",
                          iconSet.hoverIcon && "group-hover:opacity-0"
                        )}
                      />
                      {iconSet.hoverIcon && (
                        <Image
                          src={iconSet.hoverIcon}
                          alt={`${asset.symbolFallback} Icon ${i + 1} Hover`}
                          width={48}
                          height={48}
                          className="absolute top-0 left-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <Image
                    src={asset.icon}
                    alt={`${asset.symbolFallback} Icon`}
                    width={100}
                    height={100}
                    className={cn(
                      "transition-opacity duration-300",
                      asset.hoverIcon && "group-hover:opacity-0"
                    )}
                  />
                  {asset.hoverIcon && (
                    <Image
                      src={asset.hoverIcon}
                      alt={`${asset.symbolFallback} Icon Hover`}
                      width={100}
                      height={100}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    />
                  )}
                </>
              )}
            </div>

            {/* Symbol */}
            <h4 className="text-2xl font-bold text-center mb-2">
              <span className={cn(
                "bg-gradient-to-r bg-clip-text text-transparent",
                asset.color
              )}>{t(asset.symbolKey)}</span>
            </h4>

            {/* Name */}
            <p className="text-sm text-gray-400 text-center font-semibold mb-3">
              {t(asset.nameKey)}
            </p>

            {/* Description */}
            <p className="text-sm text-gray-300 text-center leading-relaxed">
              {t(asset.descKey)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
