
"use client";

import { useEffect, useState, type FC } from "react";
import axios from "axios";
import { subscribeAuth } from "@/lib/auth/broadcast";
import { SessionContext, type AuthUser } from "./session-context";

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

export { useOptionalSession, useOptionalSessionLoading, useSessionContext, type AuthUser, type SessionContextType } from "./session-context";
