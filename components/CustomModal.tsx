/**
 * @file components/CustomModal.tsx
 * @description A customizable modal using a two-layer overlay for a clean, hierarchical effect.
 * @summary Implements a two-layer modal system. A background overlay (`z-40`) provides a light (`bg-black/[.15]`) and blurred (`backdrop-blur-2px`) effect. The modal itself sits on a separate container (`z-50`) above this layer. The modal panel uses a stronger `backdrop-blur-lg` and `bg-white/20`, creating a distinct frosted-glass look without applying any filters to the modal's content, ensuring it remains crisp and clear.
 */
"use client"

import type React from "react"
import { useEffect, useRef } from "react"
import { X } from "lucide-react"

interface CustomModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  contentRef?: React.RefObject<HTMLDivElement>
  modalClassName?: string
  bodyClassName?: string
}

const CustomModal: React.FC<CustomModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  contentRef,
  modalClassName,
  bodyClassName,
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const defaultContentRef = useRef<HTMLDivElement>(null)
  const activeContentRef = contentRef || defaultContentRef

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.addEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.removeEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = ""
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Background Overlay */}
      <div className="fixed inset-0 z-40 bg-black/[.15] backdrop-blur-2px" />

      {/* Modal Container */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-10">
        <div
          ref={modalRef}
          className={`bg-white/20 backdrop-blur-lg border-transparent rounded-lg max-w-md max-h-[80vh] overflow-hidden ${modalClassName}`}
        >
          <div className="flex justify-between items-center p-4 border-b">
            <h2 className="text-lg font-bold text-white" style={{ textShadow: "0 0 10px rgba(255, 255, 255, 0.8)" }}>{title}</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 transition-colors">
              <X size={20} />
            </button>
          </div>
          <div ref={activeContentRef} className={`p-4 overflow-auto max-h-[calc(80vh-4rem)] text-[#284372] ${bodyClassName}`}>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}

export default CustomModal
