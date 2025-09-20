/**
 * @file components/SocialButtons.tsx
 * @description This component renders a set of social media icons with responsive positioning.
 *
 * The buttons are fixed to the bottom-right corner of the viewport. On mobile devices, the `right-4` class is applied to provide a smaller offset, preventing horizontal overflow. On medium screens and larger, `md:right-8` is used to increase the offset for better visual balance on desktop layouts. This ensures the component remains fully visible across all screen sizes without causing unwanted scrolling.
 *
 * The component includes links to X.com (formerly Twitter), GitHub, and the project's documentation, along with a popover for additional contact options. Each button is designed with accessibility in mind, featuring `aria-label` attributes for screen readers.
 */
"use client"

import type React from "react"
import { Github, FileText, Mail } from "lucide-react"
import XIcon from "./XIcon"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const SocialButtons: React.FC = () => {
  return (
    <div className="fixed bottom-10 right-4 md:right-8 z-40 flex flex-col gap-3">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-[#284372] hover:bg-blue-100 transition-colors"
            aria-label="Contact Us"
          >
            <Mail className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto">
          <div className="flex flex-col gap-2 text-sm">
            <a
              href="mailto:inquiries@subfrost.io"
              className="text-[#284372] hover:underline"
            >
              Email Us
            </a>
            <a
              href="https://x.com/SUBFROSTio/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#284372] hover:underline"
            >
              Message us on X
            </a>
          </div>
        </PopoverContent>
      </Popover>
      <a
        href="https://x.com/SUBFROSTio"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-[#284372] hover:bg-blue-100 transition-colors"
        aria-label="X.com"
      >
        <XIcon className="w-4 h-4" />
      </a>
      <a
        href="https://github.com/subfrost"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-[#284372] hover:bg-blue-100 transition-colors"
        aria-label="GitHub"
      >
        <Github className="w-4 h-4" />
      </a>
      <a
        href="https://docs.subfrost.io/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-[#284372] hover:bg-blue-100 transition-colors"
        aria-label="Documentation"
      >
        <FileText className="w-4 h-4" />
      </a>
    </div>
  )
}

export default SocialButtons
