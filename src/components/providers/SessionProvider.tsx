
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FC,
} from "react";
import axios from "axios";
import { subscribeAuth } from "@/lib/auth/broadcast";
import type { Role } from "@/lib/auth/roles";

export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  metadata: Record<string, unknown>;
  /** member, moderator or admin (migration 0012). */
  role?: Role;
}

export interface SessionContextType {
  session: AuthUser | null;
  setSession: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(
  undefined
);

export const SessionContextProvider: FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchSession = () => {
    setIsLoading(true);
    axios
      .get<{ user: AuthUser }>("/api/auth/user", { withCredentials: true })
      .then((res) => setSession(res.data.user))
      .catch(() => setSession(null))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchSession();

    // Re-read the session when another tab logs in or out.
    return subscribeAuth(() => fetchSession());
  }, []);

  return (
    <SessionContext.Provider value={{ session, setSession, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
};

/** The session where there may be no provider (a story, a test): null outside one. */
export const useOptionalSession = () => useContext(SessionContext)?.session ?? null;

export const useSessionContext = (): SessionContextType => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be inside provider");
  return ctx;
};

