"use client"

import type React from "react"
import { Github, FileText } from "lucide-react"
import XIcon from "./XIcon"
import DiscordIcon from "./DiscordIcon"

const SocialButtons: React.FC = () => {
  return (
    <div className="fixed bottom-10 right-8 z-40 flex flex-col gap-3">
      <a
        href="https://x.com/SUBFROSTio"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full bg-blue-50 text-[#284372] hover:bg-blue-100 transition-colors"
        aria-label="X.com"
      >
        <XIcon className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6" />
      </a>
      <a
        href="https://discord.gg/zBkpaDAt2W"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full bg-blue-50 text-[#284372] hover:bg-blue-100 transition-colors"
        aria-label="Discord"
      >
        <DiscordIcon className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6" />
      </a>
      <a
        href="https://github.com/subfrost"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full bg-blue-50 text-[#284372] hover:bg-blue-100 transition-colors"
        aria-label="GitHub"
      >
        <Github className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6" />
      </a>
      <a
        href="https://docs.subfrost.io/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full bg-blue-50 text-[#284372] hover:bg-blue-100 transition-colors"
        aria-label="Documentation"
      >
        <FileText className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6" />
      </a>
    </div>
  )
}

export default SocialButtons
