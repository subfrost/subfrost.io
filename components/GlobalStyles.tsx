/*
 * @file components/GlobalStyles.tsx
 * @description Global styles for the application.
 *
 * Journal:
 * 2025-11-01: Removed `text-shadow` from `.snow-title-no-filter` to eliminate the shadow effect from subheaders, improving text clarity and aligning with a cleaner design aesthetic.
 */
"use client"

import type React from "react"

const GlobalStyles: React.FC = () => (
  <style jsx global>{`
    @keyframes fall {
      0% {
        transform: translateY(0) rotate(0deg);
      }
      100% {
        transform: translateY(calc(100vh + 50px)) rotate(360deg);
      }
    }
    
    @keyframes rise {
      from {
        bottom: -5%;
        transform: rotate(0deg);
      }
      to {
        bottom: 105%;
        transform: rotate(360deg);
      }
    }

    @keyframes slow-rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes slow-rotate-reverse {
      from {
        transform: rotate(360deg);
      }
      to {
        transform: rotate(0deg);
      }
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .animate-blink {
      animation: blink 1s step-end infinite;
    }
    
    /* Continuous ticker animation */
    @keyframes continuousTicker {
      0% {
        transform: translateX(0);
      }
      100% {
        transform: translateX(-50%);
      }
    }
    
    .subtitle-container {
      width: 600px;
      overflow: hidden;
      white-space: nowrap;
    }
    
    .continuous-ticker {
      display: inline-block;
      white-space: nowrap;
      animation: continuousTicker 39s linear infinite; /* Slowed down by 50% from 26s to 39s */
    }
    
    .snow-title {
      text-shadow:
        0 0 5px rgba(255, 255, 255, 0.8),
        0 0 10px rgba(255, 255, 255, 0.5),
        0 0 15px rgba(255, 255, 255, 0.4),
        0 0 20px rgba(219, 234, 254, 0.3),
        0 0 25px rgba(219, 234, 254, 0.2),
        0 0 30px rgba(219, 234, 254, 0.1),
        1px 1px 2px rgba(219, 234, 254, 0.8),
        -1px -1px 2px rgba(219, 234, 254, 0.8),
        1px -1px 2px rgba(219, 234, 254, 0.8),
        -1px 1px 2px rgba(219, 234, 254, 0.8);
      filter: drop-shadow(0 0 2px rgba(219, 234, 254, 0.5));
    }

    .snow-title-no-filter {
      text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
      padding: 0.5rem 0;
    }

    .snow-image {
      filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.5));
    }
    
    .snow-button {
      position: relative;
      transition: all 0.3s ease;
      background-color: white !important;
      color: #284372 !important;
    }
    
    .snow-button:hover {
      background-color: #bfdbfe !important;
      color: #284372 !important;
      box-shadow:
        0 0 5px rgba(255, 255, 255, 0.8),
        0 0 10px rgba(255, 255, 255, 0.5),
        0 0 15px rgba(219, 234, 254, 0.4),
        0 0 20px rgba(219, 234, 254, 0.3);
      transform: translateY(-1px);
    }
    
    .modal-action-button {
      position: relative;
      transition: all 0.3s ease;
      background-color: #bfdbfe !important;
      color: #284372 !important;
    }
    
    .modal-action-button:hover {
      background-color: white !important;
      color: #284372 !important;
      box-shadow:
        0 0 5px rgba(255, 255, 255, 0.8),
        0 0 10px rgba(255, 255, 255, 0.5),
        0 0 15px rgba(219, 234, 254, 0.4),
        0 0 20px rgba(219, 234, 254, 0.3);
      transform: translateY(-1px);
    }

    /* Smooth scrolling */
    html {
      scroll-behavior: smooth;
    }

    /* Section animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .animate-fade-in {
      animation: fadeIn 0.8s ease-out forwards;
    }

    /* ICO-era pulse animation */
    @keyframes pulse-glow {
      0%, 100% {
        box-shadow: 0 0 5px rgba(59, 130, 246, 0.5),
                    0 0 10px rgba(59, 130, 246, 0.3),
                    0 0 15px rgba(59, 130, 246, 0.2);
      }
      50% {
        box-shadow: 0 0 10px rgba(59, 130, 246, 0.8),
                    0 0 20px rgba(59, 130, 246, 0.5),
                    0 0 30px rgba(59, 130, 246, 0.3);
      }
    }

    @keyframes gradient-shift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .animate-pulse-glow {
      animation: pulse-glow 2s ease-in-out infinite;
    }

    .animate-gradient-shift {
      background-size: 200% 200%;
      animation: gradient-shift 3s ease infinite;
    }

    /* Snap scrolling */
    @media (min-width: 768px) {
      body {
        scroll-snap-type: y mandatory;
        overflow-y: scroll;
      }

      section {
        scroll-snap-align: start;
        scroll-snap-stop: always;
      }
    }
    
    /* Disable snap scrolling on mobile for better UX */
    @media (max-width: 767px) {
      body {
        scroll-snap-type: none;
      }
      
      section {
        scroll-snap-align: none;
        scroll-snap-stop: normal;
      }
    }
  `}</style>
)

export default GlobalStyles
