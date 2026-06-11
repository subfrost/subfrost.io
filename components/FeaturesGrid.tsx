/**
 * @file components/FeaturesGrid.tsx
 * @description Two-box layout with combined features text on left and demo video placeholder on right
 */
"use client"

import React, { useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/hooks/useTranslation"

// Add keyframes for the rainbow border animation and pulse effect
const style = typeof document !== 'undefined' ? document.createElement('style') : null
if (style) {
  style.innerHTML = `
    @property --fill-progress {
      syntax: '<number>';
      initial-value: 0;
      inherits: false;
    }
    
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
    @keyframes pulse-subtle {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.02); opacity: 0.95; }
    }
    @keyframes glow-pulse {
      0%, 100% { opacity: 0; }
      50% { opacity: 0.15; }
    }
    @keyframes border-fill {
      from {
        --fill-progress: 0;
      }
      to {
        --fill-progress: 1;
      }
    }
    .animate-spin-slow {
      animation: spin-slow 4s linear infinite;
    }
    .animate-pulse-subtle {
      animation: pulse-subtle 3s ease-in-out infinite;
    }
  `
  if (typeof document !== 'undefined' && !document.head.querySelector('#feature-grid-animations')) {
    style.id = 'feature-grid-animations'
    document.head.appendChild(style)
  }
}



interface Feature {
  buttonTitleKey: string
  titleKey: string
  descriptionKeys: string[]
  glowColor: string
  isRainbow?: boolean
  image: string
}

const features: Feature[] = [
  {
    buttonTitleKey: "features.amm.buttonTitle",
    titleKey: "features.amm.title",
    descriptionKeys: ["features.amm.desc1", "features.amm.desc2"],
    glowColor: "from-cyan-400 via-sky-500 via-blue-500 via-indigo-600 to-blue-800",
    isRainbow: true,
    image: "/app screenshots/swap.png"
  },
  {
    buttonTitleKey: "features.bridge.buttonTitle",
    titleKey: "features.bridge.title",
    descriptionKeys: ["features.bridge.desc1", "features.bridge.desc2"],
    glowColor: "from-cyan-400 via-sky-500 via-blue-500 via-indigo-600 to-blue-800",
    isRainbow: true,
    image: "/app screenshots/bridge.png"
  },
  {
    buttonTitleKey: "features.vaults.buttonTitle",
    titleKey: "features.vaults.title",
    descriptionKeys: ["features.vaults.desc1", "features.vaults.desc2"],
    glowColor: "from-cyan-400 via-sky-500 via-blue-500 via-indigo-600 to-blue-800",
    isRainbow: true,
    image: "/app screenshots/vaults.png"
  },
  {
    buttonTitleKey: "features.futures.buttonTitle",
    titleKey: "features.futures.title",
    descriptionKeys: ["features.futures.desc1", "features.futures.desc2"],
    glowColor: "from-cyan-400 via-sky-500 via-blue-500 via-indigo-600 to-blue-800",
    isRainbow: true,
    image: "/app screenshots/futures.png"
  },
  {
    buttonTitleKey: "features.dxbtc.buttonTitle",
    titleKey: "features.dxbtc.title",
    descriptionKeys: ["features.dxbtc.desc1", "features.dxbtc.desc2", "features.dxbtc.desc3"],
    glowColor: "from-cyan-400 via-sky-500 via-blue-500 via-indigo-600 to-blue-800",
    isRainbow: true,
    image: "/app screenshots/DXBTC.png"
  }
]

export default function FeaturesGrid() {
  const { t } = useTranslation()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [buttonHeight, setButtonHeight] = useState<number | undefined>(undefined)
  const buttonRefs = React.useRef<(HTMLDivElement | null)[]>([])

  // Measure tallest button and sync heights
  React.useEffect(() => {
    const measure = () => {
      const heights = buttonRefs.current.map(el => {
        if (!el) return 0
        el.style.minHeight = ''
        return el.scrollHeight
      })
      const max = Math.max(...heights)
      if (max > 0) setButtonHeight(max)
    }
    measure()
    // Re-measure after fonts load (initial measurement may use fallback font metrics)
    document.fonts.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Auto-rotate through features every 6 seconds
  React.useEffect(() => {
    if (hoveredIndex !== null) {
      return
    }

    // Start immediately with first feature
    if (activeIndex === null) {
      setActiveIndex(0)
    }

    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        if (prev === null) return 0
        return (prev + 1) % features.length
      })
    }, 6000)

    return () => clearInterval(interval)
  }, [hoveredIndex, activeIndex])

  const displayIndex = hoveredIndex !== null ? hoveredIndex : activeIndex

  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-8 mt-16">
      {/* Left Side - Feature Buttons (40%) */}
      <div className="flex flex-col">
        {/* Title */}
        <h3 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter mb-6">
          {t("features.keyFeatures")}
        </h3>
        
        {/* Buttons */}
        <div className="space-y-4" onMouseLeave={() => setHoveredIndex(null)}>
          {features.map((feature, index) => {
            const isActive = hoveredIndex === index || (hoveredIndex === null && activeIndex === index)
            // Use brighter colors to match the timer effect
            const borderColor = feature.glowColor.includes('blue') ? '#60a5fa' :
                               feature.glowColor.includes('purple') ? '#c084fc' :
                               feature.glowColor.includes('emerald') ? '#34d399' : '#60a5fa'

            return (
            <div key={index} className="relative" onMouseEnter={() => setHoveredIndex(index)}>
              {/* Rainbow border overlay for hover state - maintains rounded corners */}
              {isActive && hoveredIndex === index && feature.isRainbow && (
                <div 
                  className="absolute inset-0 rounded-lg pointer-events-none z-10"
                  style={{
                    background: `linear-gradient(90deg, #22d3ee, #0ea5e9, #3b82f6, #4f46e5, #1e3a8a)`,
                    padding: '2px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude'
                  }}
                />
              )}
              
              {/* Progressive border fill overlay - only for active timer state */}
              {isActive && activeIndex === index && hoveredIndex === null && (
                <div 
                  className="absolute inset-0 rounded-lg pointer-events-none z-10"
                  style={feature.isRainbow ? {
                    background: `
                      conic-gradient(
                        from -90deg,
                        #22d3ee 0deg,
                        #0ea5e9 calc(var(--fill-progress, 0) * 0.2 * 360deg),
                        #3b82f6 calc(var(--fill-progress, 0) * 0.4 * 360deg),
                        #4f46e5 calc(var(--fill-progress, 0) * 0.6 * 360deg),
                        #1e3a8a calc(var(--fill-progress, 0) * 0.8 * 360deg),
                        #22d3ee calc(var(--fill-progress, 0) * 360deg),
                        rgb(71 85 105 / 0.5) calc(var(--fill-progress, 0) * 360deg)
                      )
                    `,
                    padding: '2px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                    ['--fill-progress' as string]: '0',
                    animation: 'border-fill 6s linear forwards',
                    opacity: 1
                  } : {
                    background: `
                      conic-gradient(
                        from -90deg,
                        ${borderColor} calc(var(--fill-progress, 0) * 360deg),
                        rgb(71 85 105 / 0.5) calc(var(--fill-progress, 0) * 360deg)
                      )
                    `,
                    padding: '2px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                    ['--fill-progress' as string]: '0',
                    animation: 'border-fill 6s linear forwards',
                    opacity: 1
                  }}
                />
              )}
              
              <div
                className={cn(
                  "relative w-full text-lg font-bold uppercase tracking-wider text-white snow-title-no-filter",
                  "rounded-lg transition-colors duration-500 text-left overflow-hidden group py-4 cursor-default",
                  "bg-gradient-to-r from-slate-700/50 to-slate-800/50 border",
                  hoveredIndex === index
                    ? feature.isRainbow
                      ? "border-transparent"
                      : ""
                    : isActive
                    ? "border-slate-600/50"
                    : "border-slate-600/50"
                )}
                ref={(el) => { buttonRefs.current[index] = el }}
                style={{
                  ...(buttonHeight ? { minHeight: buttonHeight } : {}),
                  ...(hoveredIndex === index && !feature.isRainbow ? {
                    borderColor: borderColor
                  } : {})
                }}
              >
                <div className="px-8">
                  {t(feature.buttonTitleKey)}
                </div>
              </div>
            </div>
          )})}
        </div>
      </div>

      {/* Right Box - Demo Video Placeholder (2/3) */}
      <div
        className={cn(
          "relative rounded-2xl p-8 transition-all duration-500",
          "bg-gradient-to-br from-slate-800/50 to-slate-900/50",
          "backdrop-blur-sm",
          "flex flex-col items-center justify-center overflow-hidden",
          "md:h-[500px]",
          "border-2",
          hoveredIndex !== null && features[hoveredIndex].isRainbow
            ? "border-transparent"
            : displayIndex !== null && features[displayIndex].isRainbow
            ? "border-transparent"
            : displayIndex === null
            ? "border-slate-700/50"
            : ""
        )}
        style={(() => {
          const getColor = (glowColor: string) =>
            glowColor.includes('blue') ? '#60a5fa' :
            glowColor.includes('emerald') ? '#34d399' : '#60a5fa'

          if (hoveredIndex !== null && !features[hoveredIndex].isRainbow) {
            return { borderColor: getColor(features[hoveredIndex].glowColor) }
          }
          if (hoveredIndex === null && displayIndex !== null && !features[displayIndex].isRainbow) {
            return { borderColor: getColor(features[displayIndex].glowColor) }
          }
          return {}
        })()}
      >
        {/* Rainbow border overlay for video - maintains rounded corners */}
        {((hoveredIndex !== null && features[hoveredIndex].isRainbow) ||
          (hoveredIndex === null && displayIndex !== null && features[displayIndex].isRainbow)) && (
          <div 
            className="absolute inset-0 rounded-2xl pointer-events-none z-10"
            style={{
              background: `linear-gradient(90deg, #22d3ee, #0ea5e9, #3b82f6, #4f46e5, #1e3a8a)`,
              padding: '2px',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude'
            }}
          />
        )}
        

        
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center space-y-2">
          {/* Feature title - shown on hover/active, default state when not hovering */}
          <h3 className="text-2xl font-bold uppercase tracking-wider text-center transition-all duration-300 text-white">
            {displayIndex !== null ? t(features[displayIndex].titleKey) : t("features.overviewTitle")}
          </h3>

          {/* Feature description */}
          <div className="text-sm text-gray-300 text-center max-w-2xl px-4 transition-all duration-300">
            {displayIndex !== null
              ? features[displayIndex].descriptionKeys.map((key, i) => (
                  <p key={i} className={i > 0 ? "mt-2" : ""}>{t(key)}</p>
                ))
              : t("features.overviewDescription")}
          </div>

          {/* Demo Coming Soon text */}
          <h4 className="text-sm font-semibold uppercase tracking-wider text-center transition-all duration-300 text-gray-400">
            {displayIndex !== null ? "" : t("features.demoComingSoon")}
          </h4>
          
          {/* Video placeholder with screenshot */}
          <div className="relative w-full max-w-lg aspect-video bg-slate-900/50 rounded-lg border border-slate-600/50 overflow-hidden">
            {displayIndex !== null ? (
              <>
                {/* Screenshot */}
                <Image
                  key={displayIndex}
                  src={features[displayIndex].image}
                  alt={t(features[displayIndex].titleKey)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 66vw"
                  priority
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg 
                  viewBox="0 0 200 200" 
                  className="w-16 h-16 opacity-40"
                >
                  <defs>
                    <linearGradient id="videoGradientDefault" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{ stopColor: "#60a5fa", stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: "#8b5cf6", stopOpacity: 1 }} />
                    </linearGradient>
                  </defs>
                  
                  {/* Play button icon */}
                  <circle cx="100" cy="100" r="80" fill="none" stroke="url(#videoGradientDefault)" strokeWidth="4">
                    <animate attributeName="r" values="80;85;80" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <polygon 
                    points="80,70 80,130 140,100" 
                    fill="url(#videoGradientDefault)"
                  >
                    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                  </polygon>
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
