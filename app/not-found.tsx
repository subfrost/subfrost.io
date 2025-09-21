/**
 * @file app/not-found.tsx
 * @description This file defines the custom 404 "Page Not Found" page for the application.
 *
 * This component is automatically rendered by Next.js when a route is not found. It provides a user-friendly message and a link to navigate back to the homepage, improving the user experience for broken or invalid URLs.
 *
 * The page features a clean, centered layout with a prominent "404" heading, a descriptive message, and a button to return to the homepage. The design is consistent with the overall aesthetic of the application.
 */

import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-blue-200 to-blue-50 text-white">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-xl mt-4">Page Not Found</p>
      <Link href="/" className="mt-8 px-4 py-2 bg-white text-blue-500 rounded-md hover:bg-blue-100 transition-colors">
        Return to Homepage
      </Link>
    </div>
  )
}