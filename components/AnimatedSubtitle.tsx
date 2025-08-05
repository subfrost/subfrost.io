"use client"

import type React from "react"

const subtitles = [
  "BTC SYNTHETICS ON BITCOIN LAYER-1",
  "1:1 RESERVE.",
  "BITCOIN CONSESNUS + FROST.",
  "UNIFYING BITCOIN DEFI ECOSYSTEMS.",
  "THE USER-FRIENDLY WAY TO EARN YIELD ON BTC.",
]

const AnimatedSubtitle: React.FC = () => {
  // Concatenate all subtitles with spacers
  const fullText = subtitles.join("     ")

  return (
    <div className="subtitle-container h-6 md:h-7.5 lg:h-9 flex items-center">
      <div className="continuous-ticker text-xs sm:text-sm md:text-base lg:text-lg text-[#284372] uppercase font-bold">
        {fullText + "     " + fullText} {/* Duplicate to ensure continuous flow */}
      </div>
    </div>
  )
}

export default AnimatedSubtitle
