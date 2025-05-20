
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FC,
} from "react";
import axios from "axios";

export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  metadata: Record<string, unknown>;
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

    const bc = new BroadcastChannel("auth");
    bc.onmessage = (msg) => {
      if (msg.data === "login" || msg.data === "logout") {
        fetchSession();
      }
    };
    return () => bc.close();
  }, []);

  return (
    <SessionContext.Provider value={{ session, setSession, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSessionContext = (): SessionContextType => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be inside provider");
  return ctx;
};

