"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import CustomModal from "./CustomModal"

interface DevelopmentModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  body?: React.ReactNode
}

const DevelopmentModal: React.FC<DevelopmentModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Development Notice", 
  body 
}) => {
  const defaultBody = (
    <>
      <p>
        The SUBFROST UI demo is currently in development and not yet functional. It does not interact with the Bitcoin
        blockchain or your funds.
      </p>
      <p>Feel free to navigate the pages to get a conceptual understanding of what we are building.</p>
      <p>April 2025</p>
    </>
  );

  return (
    <CustomModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className={cn("text-xs space-y-4 font-medium")}>
        {body || defaultBody}
        <div className="flex justify-center">
          <button onClick={onConfirm} className="px-6 py-2 mt-2 rounded-md font-bold modal-action-button">
            I understand
          </button>
        </div>
      </div>
    </CustomModal>
  )
}

export default DevelopmentModal
