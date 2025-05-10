"use client"

import type { FC } from "react"
import { useState, useEffect } from "react"

const CURRENT_CHANGELOG_VERSION = "1.1"

const ChangelogModal: FC = () => {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const seen = localStorage.getItem("changelog_seen_version")
    if (seen !== CURRENT_CHANGELOG_VERSION) {
      setIsOpen(true)
    }
  }, [])

  const handleClose = () => {
    localStorage.setItem("changelog_seen_version", CURRENT_CHANGELOG_VERSION)
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div onClick={handleClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        <h2 className="text-xl font-semibold mb-2">
          What&apos;s New in Version {CURRENT_CHANGELOG_VERSION}
        </h2>
        <p className="text-sm text-gray-600 mb-4">Released May 10, 2025</p>
        <ul className="list-disc list-inside space-y-1 mb-6">
          <li>
            <strong>Faster Map Load</strong> – The map now opens more quickly
            and runs smoothly.
          </li>
          <li>
            <strong>Smart Grouping</strong> – Nearby machines are grouped
            together so the map stays clear.
          </li>
          <li>
            <strong>Precise Locations</strong> – Each machine pin is more
            accurate to its real-world spot.
          </li>
          <li>
            <strong>Up-to-Date Data</strong> – All known vending machines
            are now included in the map.
          </li>
          <li>
            <strong>Easy Zoom</strong> – Tap any group to zoom in and view
            each machine individually.
          </li>
        </ul>
        <button
          onClick={handleClose}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 hover:cursor-pointer"
        >
          Got it!
        </button>
      </div>
    </div>
  )
}

export default ChangelogModal