/**
 * @file components/CustomModal.tsx
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
  contentRef?: React.RefObject<HTMLDivElement | null>
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
      /**
       * @chadlina_bugfix (2025-10-23)
       * @see {https://radix-ui.com/primitives/docs/components/popover#custom-event-oninteractoutside}
       * @description When a Radix-based component (like a Popover or Dropdown) is opened from within this modal,
       * its content is rendered in a portal outside the modal's DOM tree. This causes clicks inside the
       * popover to be incorrectly interpreted as "outside" clicks by this `handleClickOutside` handler,
       * causing the modal to close unexpectedly.
       *
       * To fix this, we check if the click target is inside a Radix-managed popper element.
       * Radix wraps its portalled popper content (used by Popover, DropdownMenu, etc.) in a div
       * with the `data-radix-popper-content-wrapper` attribute. If the click originates from
       * within such an element, we ignore it and do not close the modal.
       */
      if (
        (e.target as HTMLElement).closest(
          '[data-radix-popper-content-wrapper]',
        )
      ) {
        return
      }

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
      <div className="fixed inset-0 z-40 bg-[#284372]/20 backdrop-blur-[2px]" />

      {/* Modal Container */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pointer-events-none">
        <div
          ref={modalRef}
          className={`bg-[#f0f7ff] rounded-2xl max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-xl shadow-[#284372]/10 pointer-events-auto ${modalClassName}`}
        >
          <div className="flex-shrink-0 bg-white/50 shadow-[0_2px_8px_rgba(40,67,114,0.15)] px-6 py-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold tracking-wider uppercase text-[#284372]">{title}</h2>
              <button
                onClick={onClose}
                className="flex items-center justify-center h-8 w-8 rounded-xl bg-white shadow-[0_2px_8px_rgba(40,67,114,0.15)] text-[#284372]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:bg-[#f0f7ff] hover:text-[#284372] hover:shadow-[0_4px_12px_rgba(40,67,114,0.2)] hover:transition-none outline-none"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div ref={activeContentRef} className={`p-6 overflow-auto text-[#284372] ${bodyClassName}`}>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}

export default CustomModal
