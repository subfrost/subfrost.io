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
}

const CustomModal: React.FC<CustomModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  contentRef,
  modalClassName,
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10">
      <div
        ref={modalRef}
        className={`bg-white rounded-lg shadow-lg max-w-md  max-h-[80vh] overflow-hidden ${modalClassName}`}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div ref={activeContentRef} className="p-4 overflow-auto max-h-[calc(80vh-4rem)]">
          {children}
        </div>
      </div>
    </div>
  )
}

export default CustomModal
