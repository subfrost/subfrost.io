"use client"

import type React from "react"
import { Mail } from "lucide-react"
import XIcon from "./XIcon"

interface ContactModalProps {
  isOpen: boolean
  onClose: () => void
}

const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg p-4 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-center font-bold mb-4">Contact Us</h3>

        <div className="space-y-4">
          <a
            href="mailto:inquiries@subfrost.io"
            className="flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors"
          >
            <Mail className="w-5 h-5 mr-3 text-[#284372]" />
            <span className="font-medium">Email us</span>
          </a>

          <a
            href="https://x.com/SUBFROSTio"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors"
          >
            <XIcon className="w-5 h-5 mr-3 text-[#284372]" />
            <span className="font-medium">DM us on X</span>
          </a>
        </div>
      </div>
    </div>
  )
}

export default ContactModal
