"use client";

/**
 * The session context, apart from the provider that fills it
 * (SessionProvider.tsx), so code that only reads the session (`<Slot>`)
 * doesn't pull the provider's fetching code into every page that uses it.
 */
import { createContext, useContext } from "react";
import type { Role } from "@/lib/auth/roles";

export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  metadata: Record<string, unknown>;
  /** member, moderator or admin (migration 0012). */
  role?: Role;
  /** Their profile picture (#290), or null for initials. */
  image?: string | null;
}

export interface SessionContextType {
  session: AuthUser | null;
  setSession: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  isLoading: boolean;
}

export const SessionContext = createContext<SessionContextType | undefined>(
  undefined
);

/** The session where there may be no provider (a story, a test): null outside one. */
export const useOptionalSession = () => useContext(SessionContext)?.session ?? null;

/** Whether the session is still loading, where there may be no provider: false outside one. */
export const useOptionalSessionLoading = () => useContext(SessionContext)?.isLoading ?? false;

export const useSessionContext = (): SessionContextType => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be inside provider");
  return ctx;
};

