export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail fast on start-up if required environment variables are missing.
    const { getServerConfig } = await import("@/server/config")
    getServerConfig()
  }
}
