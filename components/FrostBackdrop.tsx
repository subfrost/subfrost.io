"use client"


import React, { useEffect, useState, useRef } from "react"
import Image from 'next/image'
import { useIsMobile } from "@/hooks/use-mobile";

// --- SVG Snowflake Components (unchanged) ---
const Snowflake1 = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path
      d="M12 2v20M12 2l3 3M12 2l-3 3M12 22l3-3M12 22l-3-3M2 12h20M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3M4.93 4.93l14.14 14.14M4.93 4.93l3-1.5M4.93 4.93l1.5 3M19.07 19.07l-3 1.5M19.07 19.07l-1.5-3M19.07 4.93L4.93 19.07M19.07 4.93l-3-1.5M19.07 4.93l-1.5 3M4.93 19.07l3-1.5M4.93 19.07l1.5-3"
      stroke="#eff6ff"
      strokeWidth="1"
      strokeLinecap="round"
    />  </svg>
)
const Snowflake2 = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke="#eff6ff" strokeWidth="1" strokeLinecap="round" />
  </svg>
)
const Snowflake3 = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4L6 8v8l6 4 6-4V8l-6-4zM12 4v8M12 20v-8M6 8l6 4M18 8l-6 4M6 16l6-4M18 16l-6-4" stroke="#eff6ff" strokeWidth="1" strokeLinecap="round" />
  </svg>
)
const Snowflake4 = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v20M4 12h16M12 2l8 10M12 2l-8 10M12 22l8-10M12 22l-8-10" stroke="#eff6ff" strokeWidth="1" strokeLinecap="round" />
  </svg>
)
const Snowflake5 = () => (
  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" stroke="#eff6ff" strokeWidth="1" fill="none" />
    <circle cx="12" cy="12" r="2" fill="#eff6ff" />
  </svg>
)
const Snowflake6 = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L4 20h16L12 2z" stroke="#eff6ff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M12 2v12M4 20l8-6M20 20l-8-6" stroke="#eff6ff" strokeWidth="1" strokeLinecap="round" />
  </svg>
)

// --- Corrected Bitcoin Component ---
const BitcoinSnowflake = () => (
  <div style={{ color: "rgba(255, 255, 255, 0.7)", fontFamily: "Nunito, sans-serif", fontWeight: "bold" }}>
    ₿
  </div>
)

// --- Component Setup ---
const snowflakeTypes = [Snowflake1, Snowflake2, Snowflake3, Snowflake4, Snowflake5, Snowflake6]
const bitcoinSnowflakeType = BitcoinSnowflake;
const bitcoinFontSizes = ['12px', '16px', '20px', '24px'];
const mobileBitcoinFontSizes = ['12px', '16px', '20px'];


interface FrostBackdropProps {
  animationType?: 'fall' | 'shift';
  reducedOpacity?: boolean;
  invisible?: boolean;
  longFall?: boolean; // Use longer fall animation for sections with more content
}

const FrostBackdrop: React.FC<FrostBackdropProps> = ({ animationType = 'fall', reducedOpacity = false, invisible = false, longFall = false }) => {
  const [snowflakes, setSnowflakes] = useState<React.ReactNode[]>([])
  const isMobile = useIsMobile();

  useEffect(() => {
    // Increase snowflake count for longFall (blizzard effect)
    let snowflakeCount;
    if (longFall) {
      snowflakeCount = isMobile ? 300 : 600; // More snowflakes for blizzard
    } else {
      snowflakeCount = isMobile ? 70 : 100; // Original count for hero
    }
    
    const flakes = []
    for (let i = 0; i < snowflakeCount; i++) {
      // If invisible is true, make all snowflakes transparent
      // If reducedOpacity is true, make 50% of snowflakes transparent
      const shouldBeTransparent = invisible || (reducedOpacity && i % 2 === 0);
      // Randomly select a snowflake type, with a lower chance for Bitcoin.
      let SnowflakeComponent;
      if (Math.random() < 0.1) { // ~10% chance for a Bitcoin snowflake
        SnowflakeComponent = bitcoinSnowflakeType;
      } else {
        SnowflakeComponent = snowflakeTypes[Math.floor(Math.random() * snowflakeTypes.length)];
      }

      // Add random rotation
      const rotation = Math.random() * 360 // 0 to 360 degrees
      
      // Animation duration - varied 14-20s for blizzard, varied 30-130s for hero
      const animationDuration = longFall ? (14 + Math.random() * 6) : (30 + Math.random() * 100) // 14-20s for blizzard, 30-130s for hero
      
      let style: React.CSSProperties;

      // For longFall, spawn snowflakes heavily from the left to create strong wind effect
      let leftPosition;
      let topPosition;
      if (longFall && animationType === 'fall') {
        // Spawn snowflakes from left side with bias toward the left (for strong diagonal wind effect)
        // Most snowflakes will start off-screen or near the left edge and be swept right
        const rand = Math.random();
        if (rand < 0.5) {
          // 50% spawn from far left (off-screen to left edge)
          leftPosition = `${-30 + Math.random() * 40}%`; // -30% to 10%
        } else if (rand < 0.8) {
          // 30% spawn from left-center
          leftPosition = `${Math.random() * 40}%`; // 0% to 40%
        } else {
          // 20% spawn from right side
          leftPosition = `${40 + Math.random() * 60}%`; // 40% to 100%
        }
        topPosition = `-50px`;
      } else if (animationType === "shift") {
        leftPosition = `${Math.random() * 100}%`;
        topPosition = `${Math.random() * 100}%`;
      } else {
        leftPosition = `${Math.random() * 100}%`;
        topPosition = `-50px`;
      }

      if (SnowflakeComponent === BitcoinSnowflake) {
        const currentFontSizes = isMobile ? mobileBitcoinFontSizes : bitcoinFontSizes;
        const fontSize = currentFontSizes[Math.floor(Math.random() * currentFontSizes.length)];
        // All snowflakes use same windy animation that shifts direction
        const fallAnimation = longFall ? 'fallLongWindy' : 'fall';
        style = {
          position: "absolute",
          left: leftPosition,
          top: topPosition,
          animation: animationType === "shift" ? 'none' : `${fallAnimation} ${animationDuration}s linear infinite`,
          animationDelay: animationType === "shift" ? undefined : `${-Math.random() * animationDuration}s`,
          transform: `rotate(${rotation}deg)`,
          fontSize: fontSize,
          opacity: shouldBeTransparent ? 0 : 1,
        };
      } else {
        const size = 0.35 + Math.random() * 0.5; // 0.35 to 0.85 scale factor for others
        // All snowflakes use same windy animation that shifts direction
        const fallAnimation = longFall ? 'fallLongWindy' : 'fall';
        style = {
          position: "absolute",
          left: leftPosition,
          top: topPosition,
          animation: animationType === "shift" ? 'none' : `${fallAnimation} ${animationDuration}s linear infinite`,
          animationDelay: animationType === "shift" ? undefined : `${-Math.random() * animationDuration}s`,
          transform: `scale(${size}) rotate(${rotation}deg)`,
          opacity: shouldBeTransparent ? 0 : 1,
        };
      }

      flakes.push(
        <div key={i} style={style}>
          <SnowflakeComponent />
        </div>,
      )
    }
    setSnowflakes(flakes)
  }, [isMobile, reducedOpacity, invisible, animationType, longFall])

  return <div className="absolute inset-0 overflow-hidden pointer-events-none">{snowflakes}</div>
}

export default FrostBackdrop
