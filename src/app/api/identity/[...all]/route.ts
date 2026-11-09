import { getAuth } from "@/server/auth/auth"

// Better Auth's endpoints (sign-in, OAuth callbacks, email verification, password reset).
export const GET = (req: Request) => getAuth().handler(req)
export const POST = (req: Request) => getAuth().handler(req)
