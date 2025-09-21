/**
 * @file components/FrostBackdrop.tsx
 * @description Renders a dynamic background with falling snowflakes, including SVG-based shapes and Bitcoin symbols.
 *
 * This component generates a specified number of "snowflakes" and animates them to fall from top to bottom.
 * The snowflakes are a mix of predefined SVG components and a text-based Bitcoin symbol (₿).
 *
 * Key Features:
 * - Randomly selects from a variety of snowflake types with weighted probability.
 * - Assigns random sizes, rotations, and animation durations for a natural effect.
 * - Bitcoin snowflakes have a separate size range to control their appearance.
 * - Uses CSS animations for smooth, performant motion.
 *
 * The component is implemented with React hooks and is client-side rendered ("use client").
 */
"use client"

import type React from "react"
import { useEffect, useState } from "react"

// Snowflake1: 10x10
const Snowflake1 = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2v20M12 2l3 3M12 2l-3 3M12 22l3-3M12 22l-3-3M2 12h20M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3M4.93 4.93l14.14 14.14M4.93 4.93l3-1.5M4.93 4.93l1.5 3M19.07 19.07l-3 1.5M19.07 19.07l-1.5-3M19.07 4.93L4.93 19.07M19.07 4.93l-3-1.5M19.07 4.93l-1.5 3M4.93 19.07l3-1.5M4.93 19.07l1.5-3"
      stroke="#eff6ff"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
)

// Snowflake2: 10x10
const Snowflake2 = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke="#eff6ff" strokeWidth="1" strokeLinecap="round" />
  </svg>
)

// Snowflake3: 18x18
const Snowflake3 = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 4L6 8v8l6 4 6-4V8l-6-4zM12 4v8M12 20v-8M6 8l6 4M18 8l-6 4M6 16l6-4M18 16l-6-4"
      stroke="#eff6ff"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
)

// Snowflake4: 11x11
const Snowflake4 = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2v20M4 12h16M12 2l8 10M12 2l-8 10M12 22l8-10M12 22l-8-10"
      stroke="#eff6ff"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
)

// Snowflake5: 7x7
const Snowflake5 = () => (
  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" stroke="#eff6ff" strokeWidth="1" fill="none" />
    <circle cx="12" cy="12" r="2" fill="#eff6ff" />
  </svg>
)

// Snowflake6: 14x14
const Snowflake6 = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L4 20h16L12 2z"
      stroke="#eff6ff"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M12 2v12M4 20l8-6M20 20l-8-6" stroke="#eff6ff" strokeWidth="1" strokeLinecap="round" />
  </svg>
)

// Bitcoin "B" Snowflake
const BitcoinSnowflake = () => (
  <div style={{ color: "rgba(255, 255, 255, 0.7)", fontFamily: "Nunito, sans-serif", fontWeight: "bold" }}>
    ₿
  </div>
)

// Array of all snowflake components
const snowflakeTypes = [Snowflake1, Snowflake2, Snowflake3, Snowflake4, Snowflake5, Snowflake6]
const bitcoinSnowflakeType = BitcoinSnowflake;
const bitcoinFontSizes = ['12px', '16px', '20px', '24px'];

const FrostBackdrop: React.FC = () => {
  const [snowflakes, setSnowflakes] = useState<React.ReactNode[]>([])

  useEffect(() => {
    const flakes = []
    // Increased from 80 to 100 snowflakes
    for (let i = 0; i < 100; i++) {
      // Randomly select a snowflake type, with a lower chance for Bitcoin.
      let SnowflakeComponent;
      if (Math.random() < 0.1) { // ~10% chance for a Bitcoin snowflake
        SnowflakeComponent = bitcoinSnowflakeType;
      } else {
        SnowflakeComponent = snowflakeTypes[Math.floor(Math.random() * snowflakeTypes.length)];
      }

      // Add random rotation
      const rotation = Math.random() * 360 // 0 to 360 degrees
      
      // Updated animation duration to 20-140 seconds
      const animationDuration = 30 + Math.random() * 100 // 20 to 100 seconds
      
      let style: React.CSSProperties;

      if (SnowflakeComponent === BitcoinSnowflake) {
        const fontSize = bitcoinFontSizes[Math.floor(Math.random() * bitcoinFontSizes.length)];
        style = {
          position: "absolute",
          left: `${Math.random() * 100}%`,
          top: `-50px`,
          animation: `fall ${animationDuration}s linear infinite`,
          animationDelay: `${-Math.random() * 30}s`,
          transform: `rotate(${rotation}deg)`,
          fontSize: fontSize,
        };
      } else {
        const size = 0.35 + Math.random() * 0.5; // 0.35 to 0.85 scale factor for others
        style = {
          position: "absolute",
          left: `${Math.random() * 100}%`,
          top: `-50px`,
          animation: `fall ${animationDuration}s linear infinite`,
          animationDelay: `${-Math.random() * 30}s`,
          transform: `scale(${size}) rotate(${rotation}deg)`,
        };
      }

      flakes.push(
        <div key={i} style={style}>
          <SnowflakeComponent />
        </div>,
      )
    }
    setSnowflakes(flakes)
  }, [])

  return <div className="absolute inset-0 overflow-hidden pointer-events-none">{snowflakes}</div>
}

export default FrostBackdrop
