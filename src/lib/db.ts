import "server-only";
import postgres from "postgres";

declare global {
  var __lgSql: postgres.Sql | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: process.env.VERCEL ? 1 : 5,
    prepare: false, // required for Supabase's transaction pooler
    onnotice: () => {},
  });
}

function client(): postgres.Sql {
  return globalThis.__lgSql ?? (globalThis.__lgSql = create());
}

// Connect lazily so builds succeed before environment variables are set.
export const sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply: (_t, _this, args) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => {
    const c = client() as unknown as Record<PropertyKey, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

/** Runs work in a transaction tagged with an optional audit note. */
export async function tx<T>(work: (t: postgres.TransactionSql) => Promise<T>, note = ""): Promise<T> {
  return sql.begin(async (t) => {
    if (note) await t`select set_config('app.note', ${note}, true)`;
    return work(t);
  }) as Promise<T>;
}
