"use client"

import type React from "react"
import { cn } from "@/lib/utils"

interface ScrollArrowProps {
  direction: "down" | "up"
  onClick: () => void
  color?: string
  label?: string
  useSnowEffect?: boolean
}

const ScrollArrow: React.FC<ScrollArrowProps> = ({
  direction,
  onClick,
  color = "white",
  label,
  useSnowEffect = false,
}) => {
  return (
    <div className="flex flex-col items-center mt-16 cursor-pointer" onClick={onClick}>
      {/* Label above the arrow for downward arrows */}
      {direction === "down" && label && (
        <p
          className={cn(
            "mb-4 text-xs sm:text-sm md:text-base lg:text-lg uppercase font-bold",
            useSnowEffect ? "snow-title" : "",
          )}
          style={{ color }}
        >
          {label}
        </p>
      )}

      <div className="animate-bounce">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {direction === "down" ? (
            <>
              <path d="M12 5v14"></path>
              <path d="m19 12-7 7-7-7"></path>
            </>
          ) : (
            <>
              <path d="M12 19v-14"></path>
              <path d="m5 12 7-7 7 7"></path>
            </>
          )}
        </svg>
      </div>

      {/* Label below the arrow for upward arrows */}
      {direction === "up" && label && (
        <p className="mt-2 text-xs sm:text-sm md:text-base lg:text-lg uppercase font-bold" style={{ color }}>
          {label}
        </p>
      )}
    </div>
  )
}

export default ScrollArrow
