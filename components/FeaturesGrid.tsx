/**
 * @file components/FeaturesGrid.tsx
 * @description Two-box layout with combined features text on left and demo video placeholder on right
 */
"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface Feature {
  title: string
  description: string
}

const features: Feature[] = [
  {
    title: "SWAP & LP",
    description: "Execute single-transaction swaps between BTC, ZEC, ETH, and USD. Earn fees and incentives by supplying these assets (and others!) to deep liquidity pools. Seamless wrapping and unwrapping handled automatically."
  },
  {
    title: "YIELD VAULTS & GAUGES",
    description: "Access automated yield vaults of popular currencies while juicing yields by utilizing single-token gauges. Some vaults will be 100% exposed to BTC, while others will be more speculative for the degens."
  },
  {
    title: "BITCOIN FUTURES MARKET",
    description: "Participate in the first permissionless futures market for miner block rewards. Miners will hedge against their 100-block lock-up period, and users can bet on the price of BTC 100-blocks from now."
  }
]

export default function FeaturesGrid() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-16">
      {/* Left Box - Features Text */}
      <div
        className={cn(
          "relative rounded-2xl p-8 transition-all duration-500",
          "bg-gradient-to-br from-slate-800/50 to-slate-900/50",
          "border border-slate-700/50",
          "backdrop-blur-sm"
        )}
      >
        <div className="relative z-10 space-y-8">
          {features.map((feature, index) => (
            <div key={index} className="space-y-3">
              {/* Title */}
              <h3 className="text-2xl font-bold uppercase tracking-wider text-white snow-title-no-filter">
                {feature.title}
              </h3>
              
              {/* Description */}
              <p className="text-gray-300 leading-relaxed">
                {feature.description}
              </p>
              
              {/* Divider between features (except last one) */}
              {index < features.length - 1 && (
                <div className="h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent mt-6" />
              )}
            </div>
          ))}
        </div>
        
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-blue-400/50 rounded-tl-2xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-purple-400/50 rounded-br-2xl" />
      </div>

      {/* Right Box - Demo Video Placeholder */}
      <div
        className={cn(
          "relative rounded-2xl p-8 transition-all duration-500",
          "bg-gradient-to-br from-slate-800/50 to-slate-900/50",
          "border border-slate-700/50",
          "backdrop-blur-sm",
          "flex flex-col items-center justify-center",
          "min-h-[400px]"
        )}
      >
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center space-y-6">
          {/* Title above video */}
          <h3 className="text-xl font-bold uppercase tracking-wider text-gray-400 text-center">
            Demo Coming Soon
          </h3>
          
          {/* Video placeholder */}
          <div className="w-full aspect-video bg-slate-900/50 rounded-lg border border-slate-600/50 flex items-center justify-center">
            <svg 
              viewBox="0 0 200 200" 
              className="w-24 h-24 opacity-40"
            >
              <defs>
                <linearGradient id="videoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: "#60a5fa", stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: "#8b5cf6", stopOpacity: 1 }} />
                </linearGradient>
              </defs>
              
              {/* Play button icon */}
              <circle cx="100" cy="100" r="80" fill="none" stroke="url(#videoGradient)" strokeWidth="4">
                <animate attributeName="r" values="80;85;80" dur="2s" repeatCount="indefinite" />
              </circle>
              <polygon 
                points="80,70 80,130 140,100" 
                fill="url(#videoGradient)"
              >
                <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
              </polygon>
            </svg>
          </div>
        </div>
        
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-blue-400/50 rounded-tl-2xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-purple-400/50 rounded-br-2xl" />
      </div>
    </div>
  )
}
