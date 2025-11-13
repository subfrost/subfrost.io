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
 * 2025-11-05T01:33:11.319Z - Chadlina v0.1
 * Replaced the falling bitcoin image with the frBTC image.
 * - Created a new `FrBtcSvgSnowflake` component to render the `fr-btc.png` image.
 * - Updated the snowflake generation logic in `FrostBackdrop.tsx` to use `FrBtcSvgSnowflake` for the "fall" animation and keep `BitcoinSvgSnowflake` for the "shift" animation.
 * - This ensures the hero section shows falling frBTC logos while the "About" section retains the shifting bitcoin logos.
 * - Refactored the rendering logic to be more concise by checking for the `size` prop instead of `displayName`.
 *
 * 2025-11-05T01:35:43.447Z - Chadlina v0.1
 * - Increased the number of shifting bitcoins by ~15% as requested.
 * - Desktop count increased from 25 to 29.
 * - Mobile count increased from 17 to 20.
 *
 * 2025-11-05T01:49:16.693Z - Chadlina v0.1
 * - Implemented alternating images for the shifting bitcoins in the "About" section.
 * - When the animation pauses, the images switch to `fr-BTC`.
 * - When the animation resumes, they switch back to the bitcoin logo.
 * - This is achieved by introducing a 1-second pause into the animation cycle by changing the interval to 2s.
 * - The `useEffect` for the `shift` animation now uses a `setTimeout` to toggle the component after the movement transition completes.
 *
 * 2025-11-05T01:53:20.883Z - Chadlina v0.1
 * - Refined the shifting bitcoin animation to remove the pause.
 * - The images now shift every second, and the image type (Bitcoin or frBTC) is toggled with each shift.
 * - This is managed by a `useRef` (`imageToggle`) that tracks the current image state.
 * - The `setInterval` is now 1000ms, and it updates both the position and the component simultaneously.
 *
 * 2025-11-05T01:54:28.481Z - Chadlina v0.1
 * - Reverted the animation interval for the shifting bitcoins back to 2 seconds as requested.
 *
 * 2025-11-05T01:57:34.301Z - Chadlina v0.1
 * - Doubled the maximum shift distance from 48px to 96px by changing the multiplier to 192.
 * - Decreased the animation interval from 2000ms to 1500ms.
 *
 * 2025-11-05T02:03:13.585Z - Chadlina v0.1
 * - Adjusted the animation timing to swap the image at the moment the movement pauses.
 * - The `setInterval` now triggers the movement, and a `setTimeout` is scheduled for 1000ms later (the transition duration) to update the image component.
 * - This ensures the image swap happens exactly when the pause begins.
 *
 * End Journal
 */

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


const FrostBackdrop: React.FC = () => {
  const [snowflakes, setSnowflakes] = useState<React.ReactNode[]>([])
  const isMobile = useIsMobile();

  useEffect(() => {
    // On mobile, render 50% fewer snowflakes for performance.
    const snowflakeCount = isMobile ? 70 : 100;
    const flakes = []
    for (let i = 0; i < snowflakeCount; i++) {
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
        const currentFontSizes = isMobile ? mobileBitcoinFontSizes : bitcoinFontSizes;
        const fontSize = currentFontSizes[Math.floor(Math.random() * currentFontSizes.length)];
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
  }, [isMobile])

  return <div className="absolute inset-0 overflow-hidden pointer-events-none">{snowflakes}</div>
}

export default FrostBackdrop
