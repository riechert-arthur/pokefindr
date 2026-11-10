/**
 * Structured server logs (#254, docs/logging.md): one JSON object per line,
 * `{ level, event, msg?, requestId?, route?, ms?, ...fields }`, which Vercel
 * Logs can filter and search. No dependencies, so it runs anywhere the
 * server does (routes, jobs, scripts, tests).
 *
 * - `info` goes to console.info; `warn` and `error` go to console.error,
 *   since Vercel shows console.warn as an error anyway.
 * - Keys that can hold personal data or secrets (NEVER_LOG) are dropped
 *   before writing, at any depth.
 * - {@link Logger.logError} writes what an error *is* (name, Postgres code,
 *   constraint, the first line of its message) and never the error object:
 *   Drizzle's DrizzleQueryError puts the query and its bound values in its
 *   message, so logging it raw leaks whatever the query carried.
 */

export type Level = "info" | "warn" | "error"
export type Fields = Record<string, unknown>

export interface Logger {
  info(event: string, fields?: Fields): void
  warn(event: string, fields?: Fields): void
  error(event: string, fields?: Fields): void
  /** What went wrong, without the query, its values or the raw error: see {@link describeError}. */
  logError(event: string, err: unknown, fields?: Fields, level?: Exclude<Level, "info">): void
  /** A logger that adds `fields` to every line. */
  with(fields: Fields): Logger
  /** A logger for one request: `requestId` from `x-vercel-id`, and the route. */
  forRequest(request: Pick<Request, "headers">, route?: string): Logger
}

/** Keys never written (compared lowercased, without `_` or `-`). */
const NEVER_LOG = new Set([
  "email",
  "to",
  "token",
  "password",
  "secret",
  "authorization",
  "cookie",
  "setcookie",
  "lat",
  "lng",
  "lon",
  "latitude",
  "longitude",
  "coordinates",
  "center",
  "near",
  "query",
  "q",
  "params",
  "text",
  "comment",
  "question",
  "answer",
  "address",
  "ip",
])
/** …nor keys ending in these: accessToken, newPassword, clientSecret, userEmail. Not "tokens" (inputTokens is a count). */
const NEVER_LOG_SUFFIX = /(token|password|secret|email)$/

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, "")
  return NEVER_LOG.has(k) || NEVER_LOG_SUFFIX.test(k)
}

/** Long strings are cut to this, and a line that's still too long loses its fields. Vercel caps a line at 256 KB. */
const MAX_STRING = 1_000
const MAX_LINE = 16_000
/** Lines one request's logger writes before it stops (Vercel keeps 256 per request). */
export const MAX_LINES_PER_REQUEST = 100

const EMAIL = /[^\s<>"'@]+@[^\s<>"'@]+\.[a-z]{2,}/gi

/** Drops sensitive keys, cuts long strings and arrays, and turns what JSON can't hold into something it can. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
  if (value === null || typeof value !== "object") return typeof value === "bigint" ? value.toString() : value
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return describeError(value)
  if (depth >= 4) return "[nested]"
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  const out: Fields = {}
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || isSensitiveKey(k)) continue
    out[k] = redact(v, depth + 1)
  }
  return out
}

/** A Postgres error's details, from postgres-js (`constraint_name`) or node-postgres (`constraint`). */
interface PgLike {
  code?: unknown
  constraint_name?: unknown
  constraint?: unknown
  table_name?: unknown
  table?: unknown
  column_name?: unknown
  column?: unknown
  severity_local?: unknown
}

/** Postgres SQLSTATE codes are five characters: 23505, 22P02, 57014. */
const SQLSTATE = /^[0-9A-Z]{5}$/

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined)

/**
 * The first line of a message, without the values it might quote:
 * Postgres and JSON.parse put them in double quotes (`invalid input syntax
 * for type uuid: "…"`, `value "…" is out of range`, `"abc" is not valid
 * JSON`), and SMTP errors quote recipients' addresses. Every quoted run
 * goes, names too: the constraint, table and column are logged on their own.
 */
function firstLine(message: string): string {
  return message.split("\n")[0].replace(/"[^"]*"/g, '"…"').replace(EMAIL, "[email]").replace(/\?[^\s"']+/g, "?…").slice(0, 300)
}

const isDrizzleQueryError = (e: Error): e is Error & { query: string; cause?: unknown } => "query" in e && "params" in e && e.message.startsWith("Failed query:")

/** An error's message, safe to log: for a failed query, its driver's message, never the SQL. */
function safeMessage(e: Error): string {
  if (!isDrizzleQueryError(e)) return firstLine(e.message)
  return e.cause instanceof Error ? firstLine(e.cause.message) : "Failed query"
}

/**
 * What an error is, safe to log: its name, the Postgres code, constraint,
 * table and column, the first line of its message (for a failed query, the
 * driver's message instead of the SQL), and the stack frame it came from.
 * Never the query, its params, or the error object itself.
 */
export function describeError(err: unknown): Fields {
  if (!(err instanceof Error)) return { errorName: typeof err, msg: typeof err === "string" ? firstLine(err) : undefined }
  const drizzle = isDrizzleQueryError(err)
  // A failed query wraps the driver's error: its code and message say what went wrong, without the SQL.
  const cause = err.cause instanceof Error ? err.cause : undefined
  const source = (drizzle && cause ? cause : err) as Error & PgLike & { responseCode?: unknown }
  const pg = (cause ?? err) as PgLike
  const code = str(source.code) ?? str(pg.code)
  const out: Fields = {
    errorName: drizzle ? "DrizzleQueryError" : err.name,
    code,
    constraint: str(pg.constraint_name) ?? str(pg.constraint),
    table: str(pg.table_name) ?? str(pg.table),
    column: str(pg.column_name) ?? str(pg.column),
    // SMTP: 550 and the like (nodemailer).
    responseCode: typeof source.responseCode === "number" ? source.responseCode : undefined,
    msg: drizzle && !cause ? "Failed query" : firstLine(source.message),
  }
  if (cause && !drizzle) {
    // The cause can itself be a failed query (an adapter's error wrapping Drizzle's): its driver's code, never its SQL.
    const inner = isDrizzleQueryError(cause) && cause.cause instanceof Error ? (cause.cause as Error & PgLike) : undefined
    out.cause = { errorName: isDrizzleQueryError(cause) ? "DrizzleQueryError" : cause.name, code: str((cause as PgLike).code) ?? str(inner?.code), msg: safeMessage(cause) }
  }
  if (code && SQLSTATE.test(code)) out.db = true
  const at = err.stack?.split("\n").find((l) => l.trim().startsWith("at "))
  if (at) out.at = at.trim().slice(3, 200)
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

/** Writes one line. Exported for tests; use a {@link Logger}. */
export function write(level: Level, event: string, fields: Fields = {}): void {
  // A field can't stand in for the line's own level or event.
  const body = redact(fields) as Fields
  delete body.level
  delete body.event
  let line = JSON.stringify({ level, event, ...body })
  if (line.length > MAX_LINE) {
    const { requestId, route, ms, code } = body
    line = JSON.stringify({ level, event, requestId, route, ms, code, truncated: line.length })
  }
  if (level === "info") console.info(line)
  else console.error(line)
}

/**
 * Each request's line budget, kept on the request itself, so every
 * `log.forRequest(request, …)` for it, and every logger made from one,
 * shares it.
 */
const budgets = new WeakMap<object, { left: number }>()

function budgetFor(request: object): { left: number } {
  let budget = budgets.get(request)
  if (!budget) budgets.set(request, (budget = { left: MAX_LINES_PER_REQUEST }))
  return budget
}

function makeLogger(base: Fields, budget?: { left: number }): Logger {
  const emit = (level: Level, event: string, fields?: Fields) => {
    if (budget) {
      if (budget.left <= 0) return
      budget.left--
    }
    write(level, event, { ...base, ...fields })
    if (budget?.left === 0) write("warn", "log.capped", { ...base, max: MAX_LINES_PER_REQUEST })
  }
  return {
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    // The caller's fields win over the error's: they're what the caller meant to say.
    logError: (event, err, fields, level = "error") => emit(level, event, { ...describeError(err), ...fields }),
    with: (fields) => makeLogger({ ...base, ...fields }, budget),
    forRequest: (request, route) =>
      makeLogger({ ...base, requestId: request.headers.get("x-vercel-id") ?? undefined, route: route ?? base.route }, budgetFor(request)),
  }
}

/** The server's logger. In a route, `log.forRequest(request, "/api/x")` adds the request id. */
export const log: Logger = makeLogger({})

/** Shorthand for `log.logError`, for code with no request at hand. */
export const logError = (event: string, err: unknown, fields?: Fields) => log.logError(event, err, fields)

/** Database calls slower than this log `db.slow`. */
export const SLOW_QUERY_MS = 500

/**
 * Runs `fn` and, when it takes longer than {@link SLOW_QUERY_MS}, logs
 * `db.slow { op, ms }` as a warning: the name only, never the SQL or its
 * values. A failure is rethrown as is.
 */
export async function timed<T>(op: string, fn: () => Promise<T>, { thresholdMs = SLOW_QUERY_MS, logger = log }: { thresholdMs?: number; logger?: Logger } = {}): Promise<T> {
  const started = performance.now()
  try {
    return await fn()
  } finally {
    const ms = Math.round(performance.now() - started)
    if (ms > thresholdMs) logger.warn("db.slow", { op, ms })
  }
}

/**
 * One line of the admin and moderation trail: who did what to what, and how
 * it went. `actorId` is the internal user id, never an email or username.
 */
export function audit(logger: Logger, action: string, entry: { actorId: string; target?: string; outcome: string } & Fields): void {
  logger.info(`admin.${action}`, { action, ...entry })
}

/**
 * True for one call in `every`: for security lines that could flood the
 * logs (a scraper earning a 429 a second). The line says how it was sampled.
 */
export function sampled(every: number, random: () => number = Math.random): boolean {
  return every <= 1 || random() < 1 / every
}
