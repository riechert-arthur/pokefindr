
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { LoadSpinner } from "@/components/wrappers/LoadSpinner";

export default function OAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const doOAuth = async () => {
      const hashFragment = window.location.hash.substring(1);
      const params = new URLSearchParams(hashFragment);
      const accessToken = params.get("access_token");

      if (!accessToken) {
        throw Error("No access token!") 
      }

      try {
        await axios.post(
          "/api/auth/callback",
          { access_token: accessToken },
          { withCredentials: true }           
        );

        new BroadcastChannel("auth").postMessage("login");
        router.push("/home");
      } catch (err) {
        throw err 
      }
    };

    doOAuth();
  }, [router]);

  return <LoadSpinner text="Logging you in..." />;
}

