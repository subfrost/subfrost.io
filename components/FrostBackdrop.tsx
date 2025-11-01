"use client"

/*
 * @chadlina.dev
 *
 * Journal:
 * 2025-10-31T23:45:21.310Z - Chadlina v0.1
 *
 * The `animation` property was overriding the `transform` property, preventing the shift animation from working.
 * To fix this, I am introducing a nested `div` structure for the `shift` animation.
 * The outer `div` will handle the `translate` transform for movement.
 * The inner `div` will handle the `rotate` animation.
 * This separation ensures both animations play correctly without conflicting.
 *
 * End Journal
 */

import React, { useEffect, useState } from "react"
import Image from 'next/image'
import { useIsMobile } from "@/hooks/use-mobile";

// --- SVG Snowflake Components (unchanged) ---
const Snowflake1 = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v20M12 2l3 3M12 2l-3 3M12 22l3-3M12 22l-3-3M2 12h20M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3M4.93 4.93l14.14 14.14M4.93 4.93l3-1.5M4.93 4.93l1.5 3M19.07 19.07l-3 1.5M19.07 19.07l-1.5-3M19.07 4.93L4.93 19.07M19.07 4.93l-3-1.5M19.07 4.93l-1.5 3M4.93 19.07l3-1.5M4.93 19.07l1.5-3" stroke="#eff6ff" strokeWidth="1" strokeLinecap="round" />
  </svg>
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
const BitcoinSvgSnowflake = React.memo(({ size }: { size: number }) => {
  return <Image src="/bitcoin-btc-logo.svg" alt="Bitcoin" width={size} height={size} />
})
BitcoinSvgSnowflake.displayName = "BitcoinSvgSnowflake"

// --- Component Setup ---
const snowflakeTypes = [Snowflake1, Snowflake2, Snowflake3, Snowflake4, Snowflake5, Snowflake6]
const bitcoinSnowflakeTypes = [BitcoinSvgSnowflake]

interface SnowflakeState {
  key: number
  style: React.CSSProperties
  Component: React.FC<any>
  size?: number
}

interface FrostBackdropProps {
  reverse?: boolean
  animationType?: "fall" | "rise" | "shift"
}

const FrostBackdrop: React.FC<FrostBackdropProps> = ({ reverse = false, animationType = "fall" }) => {
  const [snowflakes, setSnowflakes] = useState<SnowflakeState[]>([])
  const isMobile = useIsMobile()

  // Effect for 'shift' animation
  useEffect(() => {
    if (animationType === "shift") {
      const interval = setInterval(() => {
        setSnowflakes(currentFlakes =>
          currentFlakes.map(flake => {
            const dx = (Math.random() - 0.5) * 96 // Approx 1 inch
            const dy = (Math.random() - 0.5) * 96 // Approx 1 inch
            return {
              ...flake,
              style: {
                ...flake.style,
                transform: `translate(${dx}px, ${dy}px)`,
              },
            }
          }),
        )
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [animationType])

  // Effect for initial snowflake generation
  useEffect(() => {
    let snowflakeCount;
    if (animationType === 'shift') {
      snowflakeCount = isMobile ? 17 : 25;
    } else {
      snowflakeCount = isMobile ? 70 : 100;
    }

    const flakes: SnowflakeState[] = []
    for (let i = 0; i < snowflakeCount; i++) {
      let SnowflakeComponent;
      let randomSize: number | undefined;

      if (animationType === 'shift') {
        SnowflakeComponent = BitcoinSvgSnowflake;
      } else {
        if (Math.random() < 0.1) { // ~10% chance for a Bitcoin snowflake
          SnowflakeComponent = BitcoinSvgSnowflake;
        } else {
          SnowflakeComponent = snowflakeTypes[Math.floor(Math.random() * snowflakeTypes.length)];
        }
      }

      const animationDuration = 30 + Math.random() * 100;
      let style: React.CSSProperties = {
        position: "absolute",
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
      };

      if (SnowflakeComponent === BitcoinSvgSnowflake) {
        randomSize = Math.floor(12 + Math.random() * 13); // 12px to 24px
        style.animation = `${Math.random() > 0.5 ? 'slow-rotate' : 'slow-rotate-reverse'} ${5 + Math.random() * 25}s linear infinite`;
      } else {
        const size = 0.35 + Math.random() * 0.5;
        style.transform = `scale(${size})`;
      }

      if (animationType !== 'shift') {
        style.animation = `${reverse ? 'rise' : 'fall'} ${animationDuration}s linear infinite`;
        style.animationDelay = `${-Math.random() * 30}s`;
        style.top = reverse ? 'auto' : '-50px';
        style.bottom = reverse ? '-50px' : 'auto';
      }

      flakes.push({
        key: i,
        style: style,
        Component: SnowflakeComponent,
        size: randomSize,
      });
    }
    setSnowflakes(flakes)
  }, [isMobile, reverse, animationType])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {snowflakes.map(({ key, style, Component, size }) => {
        if (animationType === "shift") {
          // Nested div structure to separate translate and rotate transforms
          return (
            <div
              key={key}
              style={{
                position: "absolute",
                left: style.left,
                top: style.top,
                transition: "transform 1s ease-in-out",
                transform: style.transform,
              }}
            >
              <div style={{ animation: style.animation }}>
                {Component.displayName === "BitcoinSvgSnowflake" && size ? <Component size={size} /> : <Component />}
              </div>
            </div>
          )
        }
        
        // Original rendering for other animation types
        return (
          <div key={key} style={style}>
            {Component.displayName === "BitcoinSvgSnowflake" && size ? <Component size={size} /> : <Component />}
          </div>
        )
      })}
    </div>
  );
}

export default FrostBackdrop
