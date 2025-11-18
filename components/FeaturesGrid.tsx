/**
 * @file components/FeaturesGrid.tsx
 * @description Features grid with ICO-era visuals showing Swap, Provide Liquidity, and Explore Markets
 */
"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface Feature {
  title: string
  description: string
  icon: React.ReactNode
}

const SwapIcon = () => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <defs>
      <linearGradient id="swapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#60a5fa", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#3b82f6", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="swapGlow">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    {/* Bitcoin circle */}
    <circle cx="60" cy="60" r="35" fill="url(#swapGradient)" filter="url(#swapGlow)" opacity="0.9">
      <animate attributeName="r" values="35;38;35" dur="2s" repeatCount="indefinite" />
    </circle>
    <text x="60" y="70" textAnchor="middle" fontSize="28" fontWeight="bold" fill="white">₿</text>
    
    {/* Arrow paths with animation */}
    <path 
      d="M 95 60 Q 120 40, 145 60" 
      stroke="url(#swapGradient)" 
      strokeWidth="3" 
      fill="none" 
      filter="url(#swapGlow)"
      strokeDasharray="5,5"
    >
      <animate attributeName="stroke-dashoffset" values="0;10" dur="1s" repeatCount="indefinite" />
    </path>
    <polygon points="145,60 140,55 140,65" fill="url(#swapGradient)" filter="url(#swapGlow)" />
    
    <path 
      d="M 145 80 Q 120 100, 95 80" 
      stroke="url(#swapGradient)" 
      strokeWidth="3" 
      fill="none" 
      filter="url(#swapGlow)"
      strokeDasharray="5,5"
    >
      <animate attributeName="stroke-dashoffset" values="0;10" dur="1s" repeatCount="indefinite" />
    </path>
    <polygon points="95,80 100,75 100,85" fill="url(#swapGradient)" filter="url(#swapGlow)" />
    
    {/* USD/ETH/ZEC circle */}
    <circle cx="180" cy="70" r="35" fill="url(#swapGradient)" filter="url(#swapGlow)" opacity="0.9">
      <animate attributeName="r" values="35;38;35" dur="2s" repeatCount="indefinite" begin="1s" />
    </circle>
    <text x="180" y="75" textAnchor="middle" fontSize="20" fontWeight="bold" fill="white">$</text>
    
    {/* Single transaction indicator */}
    <circle cx="120" cy="140" r="45" fill="none" stroke="url(#swapGradient)" strokeWidth="2" opacity="0.6">
      <animate attributeName="r" values="45;50;45" dur="3s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.6;0.3;0.6" dur="3s" repeatCount="indefinite" />
    </circle>
    <text x="120" y="145" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#60a5fa">1-TX</text>
  </svg>
)

const LiquidityIcon = () => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <defs>
      <linearGradient id="liquidityGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#34d399", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#10b981", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="liquidityGlow">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    {/* Pool container */}
    <rect 
      x="50" 
      y="60" 
      width="100" 
      height="80" 
      rx="10" 
      fill="none" 
      stroke="url(#liquidityGradient)" 
      strokeWidth="3"
      filter="url(#liquidityGlow)"
      opacity="0.8"
    />
    
    {/* Asset drops flowing in */}
    <circle cx="70" cy="20" r="8" fill="url(#liquidityGradient)" filter="url(#liquidityGlow)">
      <animate attributeName="cy" values="20;70" dur="2s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" />
    </circle>
    <circle cx="100" cy="20" r="8" fill="url(#liquidityGradient)" filter="url(#liquidityGlow)">
      <animate attributeName="cy" values="20;70" dur="2s" repeatCount="indefinite" begin="0.5s" />
      <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" begin="0.5s" />
    </circle>
    <circle cx="130" cy="20" r="8" fill="url(#liquidityGradient)" filter="url(#liquidityGlow)">
      <animate attributeName="cy" values="20;70" dur="2s" repeatCount="indefinite" begin="1s" />
      <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" begin="1s" />
    </circle>
    
    {/* Pool level indicator with animation */}
    <rect 
      x="55" 
      y="100" 
      width="90" 
      height="35" 
      fill="url(#liquidityGradient)" 
      opacity="0.4"
    >
      <animate attributeName="height" values="35;40;35" dur="3s" repeatCount="indefinite" />
      <animate attributeName="y" values="100;95;100" dur="3s" repeatCount="indefinite" />
    </rect>
    
    {/* Rewards flowing out */}
    <circle cx="160" cy="100" r="6" fill="#fbbf24" filter="url(#liquidityGlow)">
      <animate attributeName="cx" values="160;180" dur="2s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" />
    </circle>
    <text x="185" y="105" fontSize="14" fill="#fbbf24">💰</text>
    
    {/* LP Token label */}
    <text x="100" y="180" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#34d399">EARN FEES</text>
  </svg>
)

const MarketsIcon = () => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <defs>
      <linearGradient id="marketsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#a78bfa", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#8b5cf6", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="marketsGlow">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    {/* Central vault */}
    <rect 
      x="70" 
      y="60" 
      width="60" 
      height="80" 
      rx="8" 
      fill="url(#marketsGradient)" 
      filter="url(#marketsGlow)"
      opacity="0.7"
    />
    
    {/* Vault door */}
    <circle cx="100" cy="100" r="18" fill="none" stroke="white" strokeWidth="2" opacity="0.9" />
    <circle cx="100" cy="100" r="12" fill="none" stroke="white" strokeWidth="2" opacity="0.9" />
    <circle cx="100" cy="100" r="6" fill="none" stroke="white" strokeWidth="2" opacity="0.9" />
    <circle cx="108" cy="100" r="3" fill="white" opacity="0.9" />
    
    {/* Yield streams */}
    <g opacity="0.8">
      {/* yvfrBTC */}
      <circle cx="40" cy="70" r="15" fill="url(#marketsGradient)" filter="url(#marketsGlow)">
        <animate attributeName="r" values="15;18;15" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x="40" y="75" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">yv</text>
      <path d="M 55 70 L 70 80" stroke="url(#marketsGradient)" strokeWidth="2" filter="url(#marketsGlow)">
        <animate attributeName="stroke-dasharray" values="0,100;100,0" dur="2s" repeatCount="indefinite" />
      </path>
      
      {/* ftrBTC */}
      <circle cx="40" cy="130" r="15" fill="url(#marketsGradient)" filter="url(#marketsGlow)">
        <animate attributeName="r" values="15;18;15" dur="2s" repeatCount="indefinite" begin="0.5s" />
      </circle>
      <text x="40" y="135" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">ftr</text>
      <path d="M 55 130 L 70 120" stroke="url(#marketsGradient)" strokeWidth="2" filter="url(#marketsGlow)">
        <animate attributeName="stroke-dasharray" values="0,100;100,0" dur="2s" repeatCount="indefinite" begin="0.5s" />
      </path>
      
      {/* dxBTC output */}
      <circle cx="160" cy="100" r="20" fill="url(#marketsGradient)" filter="url(#marketsGlow)">
        <animate attributeName="r" values="20;23;20" dur="2s" repeatCount="indefinite" begin="1s" />
      </circle>
      <text x="160" y="105" textAnchor="middle" fontSize="11" fontWeight="bold" fill="white">dx</text>
      <path d="M 130 100 L 140 100" stroke="url(#marketsGradient)" strokeWidth="2" filter="url(#marketsGlow)">
        <animate attributeName="stroke-dasharray" values="0,100;100,0" dur="2s" repeatCount="indefinite" begin="1s" />
      </path>
    </g>
    
    {/* Yield indicator */}
    <path 
      d="M 150 60 L 160 50 L 170 60" 
      stroke="#fbbf24" 
      strokeWidth="3" 
      fill="none"
      filter="url(#marketsGlow)"
    >
      <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
    </path>
    <text x="100" y="175" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#a78bfa">AUTO YIELD</text>
  </svg>
)

const features: Feature[] = [
  {
    title: "SWAP",
    description: "Execute single-transaction swaps between BTC, ZEC, ETH, and USD. Seamless wrapping and unwrapping handled automatically.",
    icon: <SwapIcon />
  },
  {
    title: "PROVIDE LIQUIDITY",
    description: "Earn fees and incentives by supplying assets to deep liquidity pools. Capture trading volume rewards.",
    icon: <LiquidityIcon />
  },
  {
    title: "EXPLORE MARKETS",
    description: "Access automated yield vaults (yvfrBTC, dxBTC) and the ftrBTC futures market. One-click yield strategies on native BTC.",
    icon: <MarketsIcon />
  }
]

export default function FeaturesGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
      {features.map((feature, index) => (
        <div
          key={index}
          className={cn(
            "group relative rounded-2xl p-8 transition-all duration-500",
            "bg-gradient-to-br from-slate-800/50 to-slate-900/50",
            "border border-slate-700/50 hover:border-slate-500/50",
            "backdrop-blur-sm",
            "hover:scale-105 hover:shadow-2xl",
            "hover:shadow-blue-500/20"
          )}
        >
          {/* Glow effect on hover */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative z-10">
            {/* Icon container */}
            <div className="w-full h-48 mb-6 flex items-center justify-center">
              <div className="w-40 h-40">
                {feature.icon}
              </div>
            </div>
            
            {/* Title */}
            <h3 className="text-2xl font-bold uppercase tracking-wider text-white mb-4 text-center snow-title-no-filter">
              {feature.title}
            </h3>
            
            {/* Description */}
            <p className="text-gray-300 text-center leading-relaxed">
              {feature.description}
            </p>
          </div>
          
          {/* Corner accents - ICO style */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-blue-400/50 rounded-tl-2xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-purple-400/50 rounded-br-2xl" />
        </div>
      ))}
    </div>
  )
}
