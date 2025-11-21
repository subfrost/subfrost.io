/**
 * @file components/FeaturesGrid.tsx
 * @description Two-box layout with combined features text on left and demo video placeholder on right
 */
"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"

// Add keyframes for the rainbow border animation
const style = typeof document !== 'undefined' ? document.createElement('style') : null
if (style) {
  style.innerHTML = `
    @keyframes border-rotate {
      0% { border-image-source: linear-gradient(0deg, #ec4899, #a855f7, #3b82f6, #10b981, #eab308); }
      25% { border-image-source: linear-gradient(90deg, #ec4899, #a855f7, #3b82f6, #10b981, #eab308); }
      50% { border-image-source: linear-gradient(180deg, #ec4899, #a855f7, #3b82f6, #10b981, #eab308); }
      75% { border-image-source: linear-gradient(270deg, #ec4899, #a855f7, #3b82f6, #10b981, #eab308); }
      100% { border-image-source: linear-gradient(360deg, #ec4899, #a855f7, #3b82f6, #10b981, #eab308); }
    }
    @keyframes spin-slow {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .animate-spin-slow {
      animation: spin-slow 4s linear infinite;
    }
  `
  if (typeof document !== 'undefined' && !document.head.querySelector('#feature-grid-animations')) {
    style.id = 'feature-grid-animations'
    document.head.appendChild(style)
  }
}



interface Feature {
  buttonTitle: string
  title: string
  description: string
  videoTitle: string
  glowColor: string
  isRainbow?: boolean
}

const features: Feature[] = [
  {
    buttonTitle: "AMM SWAPS",
    title: "AMM SWAPS",
    description: "For the first time ever, execute AMM swaps of MAIN assets directly on Bitcoin L1. Execute single-transaction swaps between BTC, ZEC, ETH, USD (and others!). Seamless wrapping and unwrapping is handled automatically and completely abstracted away for the user.",
    videoTitle: "SWAP DEMO COMING SOON",
    glowColor: "from-amber-500 to-orange-600"
  },
  {
    buttonTitle: "PROVIDE LIQUIDITY",
    title: "PROVIDE LIQUIDITY",
    description: "Earn LP fees by supplying assets like BTC, ZEC and USDT/USDC into deep liquidity pools without leaving Bitcoin.",
    videoTitle: "LP DEMO COMING SOON",
    glowColor: "from-blue-500 to-blue-700"
  },
  {
    buttonTitle: "YIELD VAULTS",
    title: "YIELD VAULTS",
    description: "Lock up your LP tokens in vaults and earn rewards. The best part? You don't have to provide both tokens first. Just select what your desired LP is and the lock-up period you are comfortable with, then send native BTC and the protocol will handle the rest.",
    videoTitle: "YIELD VAULT DEMO COMING SOON",
    glowColor: "from-emerald-500 to-emerald-700"
  },
  {
    buttonTitle: "BITCOIN FUTURES MARKET",
    title: "BITCOIN FUTURES MARKET",
    description: "Participate in the first permissionless futures market for miner block rewards. Miners will hedge against their 100-block lock-up period, and users can bet on the price of BTC 100-blocks from now.",
    videoTitle: "FUTURES DEMO COMING SOON",
    glowColor: "from-purple-500 to-purple-700"
  },
  {
    buttonTitle: "VAULT GAUGES",
    title: "VAULT GAUGES",
    description: "Vault rewards not enough? Don't worry, you can provide tokens into single-sided gauges to juice those yields! Gauges reward users with non-BTC token incentives.",
    videoTitle: "GAUGE DEMO COMING SOON",
    glowColor: "from-pink-500 via-purple-500 via-blue-500 via-emerald-500 to-yellow-500",
    isRainbow: true
  }
]

export default function FeaturesGrid() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-16">
      {/* Left Side - Feature Buttons */}
      <div className="flex flex-col">
        {/* Title */}
        <h3 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter mb-6">
          Key Features
        </h3>
        
        {/* Buttons */}
        <div className="space-y-4">
          {features.map((feature, index) => (
            <div key={index} className="relative">
              {/* Animated glow background */}
              <div className={cn(
                "absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 blur-2xl -z-10",
                hoveredIndex === index && "opacity-60",
                "bg-gradient-to-br",
                feature.glowColor
              )} />
              
              <button
                className={cn(
                  "relative w-full text-lg font-bold uppercase tracking-wider text-white snow-title-no-filter",
                  "rounded-lg transition-all duration-500 text-left overflow-hidden group border-2",
                  hoveredIndex === index ? "py-6" : "py-4",
                  hoveredIndex === index 
                    ? "bg-transparent" 
                    : "bg-gradient-to-r from-slate-700/50 to-slate-800/50",
                  feature.isRainbow && hoveredIndex === index 
                    ? "border-dashed"
                    : hoveredIndex === index
                    ? ""
                    : "border-slate-600/50"
                )}
                style={feature.isRainbow && hoveredIndex === index ? {
                  borderImage: "linear-gradient(90deg, #ec4899, #a855f7, #3b82f6, #10b981, #eab308) 1",
                  animation: "border-rotate 3s linear infinite"
                } : hoveredIndex === index && !feature.isRainbow ? {
                  borderColor: feature.glowColor.includes('amber') ? '#f59e0b' :
                              feature.glowColor.includes('blue') ? '#3b82f6' :
                              feature.glowColor.includes('emerald') ? '#10b981' :
                              feature.glowColor.includes('purple') ? '#a855f7' : '#60a5fa'
                } : {}}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className="px-8">
                  {/* Button Title - always visible */}
                  <div className="transition-all duration-300">
                    {feature.buttonTitle}
                  </div>
                  
                  {/* Description - shown when hovered */}
                  <div className={cn(
                    "transition-all duration-300 text-base normal-case tracking-normal font-normal leading-relaxed",
                    hoveredIndex === index ? "opacity-100 mt-3 max-h-96" : "opacity-0 max-h-0"
                  )}>
                    {feature.description}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
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
          {/* Title above video - changes on hover */}
          <h3 className="text-xl font-bold uppercase tracking-wider text-gray-400 text-center transition-all duration-300">
            {hoveredIndex !== null ? features[hoveredIndex].videoTitle : "Demo Coming Soon"}
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
