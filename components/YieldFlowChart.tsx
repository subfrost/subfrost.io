/**
 * @file components/YieldFlowChart.tsx
 * @description ICO-era styled flow chart showing how all vaults feed into yvfrBTC, and how yvfrBTC and ftrBTC feed into dxBTC
 */
"use client"

import React from "react"
import { cn } from "@/lib/utils"

export default function YieldFlowChart() {
  return (
    <div className="relative w-full">
      <svg viewBox="-10 -10 820 620" className="w-full h-auto" style={{ overflow: "visible" }}>
        <defs>
          {/* Gradients */}
          <linearGradient id="btcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "#f59e0b", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "#d97706", stopOpacity: 1 }} />
          </linearGradient>
          
          <linearGradient id="yvGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "#3b82f6", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "#1d4ed8", stopOpacity: 1 }} />
          </linearGradient>
          
          <linearGradient id="ftrGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "#8b5cf6", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "#6d28d9", stopOpacity: 1 }} />
          </linearGradient>
          
          <linearGradient id="dxGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "#10b981", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "#047857", stopOpacity: 1 }} />
          </linearGradient>
          
          {/* Glow filters */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          <filter id="strongGlow">
            <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Arrow markers - different colors */}
          <marker id="arrowheadBlue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
          </marker>
          <marker id="arrowheadPurple" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
          </marker>
          <marker id="arrowheadOrange" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
        </defs>
        
        {/* Level 1: Source Assets */}
        <g id="sources">
          {/* BTC/ZEC/ETH Pool */}
          <circle cx="150" cy="150" r="45" fill="url(#btcGradient)" filter="url(#glow)" opacity="0.9">
            <animate attributeName="r" values="45;48;45" dur="3s" repeatCount="indefinite" />
          </circle>
          <text x="150" y="145" textAnchor="middle" fontSize="16" fontWeight="bold" fill="white">BTC</text>
          <text x="150" y="162" textAnchor="middle" fontSize="12" fill="white">ZEC · ETH</text>
          <text x="150" y="180" textAnchor="middle" fontSize="12" fill="white">USD</text>
          <text x="135" y="210" textAnchor="middle" fontSize="12" fill="#d1d5db">Swap Fees </text>
          
          {/* LP Incentives */}
          <circle cx="300" cy="150" r="45" fill="url(#btcGradient)" filter="url(#glow)" opacity="0.9">
            <animate attributeName="r" values="45;48;45" dur="3s" repeatCount="indefinite" begin="1s" />
          </circle>
          <text x="300" y="150" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">LP</text>
          <text x="300" y="165" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">Incentives</text>
          <text x="300" y="210" textAnchor="middle" fontSize="12" fill="#d1d5db">Gauges</text>
          
          {/* Trading Volume */}
          <circle cx="450" cy="150" r="45" fill="url(#btcGradient)" filter="url(#glow)" opacity="0.9">
            <animate attributeName="r" values="45;48;45" dur="3s" repeatCount="indefinite" begin="2s" />
          </circle>
          <text x="450" y="150" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">Trading</text>
          <text x="450" y="165" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">Volume</text>
          <text x="474" y="210" textAnchor="middle" fontSize="12" fill="#d1d5db">Market Action</text>
        </g>
        
        {/* Cycling arrows */}
        <g id="cyclingArrows" stroke="url(#btcGradient)" strokeWidth="2" fill="none">
          <path d="M 200 145 Q 225 135, 250 145" markerEnd="url(#arrowheadOrange)" strokeDasharray="8,4">
            <animate attributeName="stroke-dashoffset" values="12;0" dur="1s" repeatCount="indefinite" />
          </path>
          <path d="M 250 155 Q 225 165, 200 155" markerEnd="url(#arrowheadOrange)" strokeDasharray="8,4">
            <animate attributeName="stroke-dashoffset" values="12;0" dur="1s" repeatCount="indefinite" />
          </path>

          <path d="M 350 145 Q 375 135, 400 145" markerEnd="url(#arrowheadOrange)" strokeDasharray="8,4">
            <animate attributeName="stroke-dashoffset" values="12;0" dur="1s" repeatCount="indefinite" />
          </path>
          <path d="M 400 155 Q 375 165, 350 155" markerEnd="url(#arrowheadOrange)" strokeDasharray="8,4">
            <animate attributeName="stroke-dashoffset" values="12;0" dur="1s" repeatCount="indefinite" />
          </path>
        </g>
        
        {/* Animated flow lines from sources to yvfrBTC */}  
        <g id="flowToYv" opacity="0.8">
          <path d="M 160 195 Q 200 240, 280 280" stroke="url(#yvGradient)" strokeWidth="3" fill="none" 
                strokeDasharray="8,4" markerEnd="url(#arrowheadBlue)">
            <animate attributeName="stroke-dashoffset" values="12;0" dur="1s" repeatCount="indefinite" />
          </path>
          <path d="M 440 195 Q 400 240, 320 280" stroke="url(#yvGradient)" strokeWidth="3" fill="none" 
                strokeDasharray="8,4" markerEnd="url(#arrowheadBlue)">
            <animate attributeName="stroke-dashoffset" values="12;0" dur="1s" repeatCount="indefinite" begin="0.6s" />
          </path>
        </g>
        
        {/* Level 2: yvfrBTC - Aggregation Vault */}
        <g id="yvfrBTC">
          <rect x="220" y="300" width="160" height="80" rx="12" fill="url(#yvGradient)" 
                filter="url(#strongGlow)" opacity="0.95">
            <animate attributeName="opacity" values="0.95;1;0.95" dur="2s" repeatCount="indefinite" />
          </rect>
          <text x="300" y="335" textAnchor="middle" fontSize="24" fontWeight="bold" fill="white">yvfrBTC</text>
          <text x="300" y="360" textAnchor="middle" fontSize="14" fill="#e0e7ff">Yield Aggregator</text>
        </g>
        
        {/* Mining Rewards source for ftrBTC */}
        <g id="miningSource">
          <circle cx="600" cy="230" r="50" fill="url(#ftrGradient)" filter="url(#glow)" opacity="0.9">
            <animate attributeName="r" values="50;53;50" dur="3s" repeatCount="indefinite" />
          </circle>
          <text x="600" y="225" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">Block</text>
          <text x="600" y="242" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">Rewards</text>
          <text x="600" y="295" textAnchor="middle" fontSize="12" fill="#d1d5db">Mining Pools</text>
        </g>
        
        {/* Level 2.5: ftrBTC - Futures */}
        <g id="ftrBTC">
          <rect x="520" y="340" width="160" height="80" rx="12" fill="url(#ftrGradient)" 
                filter="url(#strongGlow)" opacity="0.95">
            <animate attributeName="opacity" values="0.95;1;0.95" dur="2s" repeatCount="indefinite" begin="0.5s" />
          </rect>
          <text x="600" y="375" textAnchor="middle" fontSize="24" fontWeight="bold" fill="white">ftrBTC</text>
          <text x="600" y="400" textAnchor="middle" fontSize="14" fill="#ede9fe">Futures Market</text>
        </g>
        
        {/* Flow from Market Action to ftrBTC */}
        <path d="M 450 225 Q 450 280, 550 320" stroke="url(#ftrGradient)" strokeWidth="3" fill="none" 
              strokeDasharray="8,4" markerEnd="url(#arrowheadPurple)">
          <animate attributeName="stroke-dashoffset" values="12;0" dur="1s" repeatCount="indefinite" />
        </path>
        
        {/* Flow from mining to ftrBTC */} 
        <path d="M 650 230 Q 720 280, 660 320" stroke="url(#ftrGradient)" strokeWidth="3" fill="none" 
              strokeDasharray="8,4" markerEnd="url(#arrowheadPurple)">
          <animate attributeName="stroke-dashoffset" values="12;0" dur="1s" repeatCount="indefinite" />
        </path>
        
        {/* Flows from yvfrBTC and ftrBTC to dxBTC */}
        <g id="flowToDx" opacity="0.8">
          <path d="M 340 380 Q 380 450, 440 480" stroke="url(#yvGradient)" strokeWidth="4" fill="none" 
                strokeDasharray="10,5" markerEnd="url(#arrowheadBlue)">
            <animate attributeName="stroke-dashoffset" values="15;0" dur="1.5s" repeatCount="indefinite" />
          </path>
          <path d="M 560 420 Q 540 445, 480 480" stroke="url(#ftrGradient)" strokeWidth="4" fill="none" 
                strokeDasharray="10,5" markerEnd="url(#arrowheadPurple)">
            <animate attributeName="stroke-dashoffset" values="15;0" dur="1.5s" repeatCount="indefinite" begin="0.5s" />
          </path>
        </g>
        
        {/* Level 3: dxBTC - Ultimate Yield */}
        <g id="dxBTC">
          <rect x="360" y="500" width="200" height="90" rx="15" fill="url(#dxGradient)" 
                filter="url(#strongGlow)" opacity="0.95">
            <animate attributeName="opacity" values="0.95;1;0.95" dur="2s" repeatCount="indefinite" />
            <animate attributeName="height" values="90;93;90" dur="3s" repeatCount="indefinite" />
          </rect>
          <text x="460" y="540" textAnchor="middle" fontSize="32" fontWeight="bold" fill="white">dxBTC</text>
          <text x="460" y="568" textAnchor="middle" fontSize="16" fill="#d1fae5">Tokenized Yield</text>
          
          
          {/* Pulsing glow effect */}
          <rect x="360" y="500" width="200" height="90" rx="15" fill="none" 
                stroke="#10b981" strokeWidth="2" opacity="0.5">
            <animate attributeName="stroke-width" values="2;4;2" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.8;0.5" dur="2s" repeatCount="indefinite" />
          </rect>
        </g>
        

        
        {/* Labels for flow */}
        <text x="200" y="260" fontSize="11" fill="#9ca3af" fontStyle="italic">fees</text>
        <text x="420" y="265" fontSize="11" fill="#9ca3af" fontStyle="italic">volume</text>
        <text x="310" y="455" fontSize="11" fill="#9ca3af" fontStyle="italic">market action</text>
        <text x="540" y="455" fontSize="11" fill="#9ca3af" fontStyle="italic">futures premiums</text>
      </svg>
      

    </div>
  )
}
