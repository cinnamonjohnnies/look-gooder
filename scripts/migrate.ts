// Applies db/migrations/*.sql in order, once each. Usage: npm run migrate
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

export async function migrate(databaseUrl: string, log = console.log) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
    );
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = readFileSync(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file}) on conflict do nothing`;
      });
      log(`applied ${file}`);
    }
    log("migrations up to date");
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  migrate(url).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
