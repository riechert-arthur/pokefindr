"use client"

import { createContext, useContext } from "react"

/** Lets a section refresh the admin's counts after it changes something (approve, hide, add...). */
export const RefreshSummary = createContext<() => void>(() => {})
export const useRefreshSummary = () => useContext(RefreshSummary)
