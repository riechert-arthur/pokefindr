import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { getDb } from "@/server/db/client"

export const dynamic = "force-dynamic"

const DB_TIMEOUT_MS = 2000

/** Liveness + database check for load balancers and container health checks. */
export async function GET() {
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("database check timed out")), DB_TIMEOUT_MS),
      ),
    ])
    return NextResponse.json({ status: "ok", database: "ok" }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[health] database check failed", err)
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
