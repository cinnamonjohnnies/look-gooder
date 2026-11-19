import postgres from "postgres";
import { migrate } from "../scripts/migrate";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/lookgooder_test";

/** Drops everything in the test database and re-applies migrations. */
export async function resetDb() {
  const admin = postgres(TEST_DB_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe("drop schema public cascade; create schema public;");
  await admin.end();
  await migrate(TEST_DB_URL, () => {});
  return postgres(TEST_DB_URL, { max: 4, onnotice: () => {} });
}

let n = 0;
/** Inserts a bare source image row (no files) for rule tests. */
export async function insertImage(sql: postgres.Sql, overrides: Record<string, unknown> = {}) {
  n += 1;
  const row = {
    sha256: `test-${Date.now()}-${n}`,
    original_filename: `photo-${n}.jpg`,
    original_path: `originals/test-${n}.jpg`,
    display_path: `display/test-${n}.jpg`,
    thumb_path: `thumbs/test-${n}.webp`,
    mime_type: "image/jpeg",
    bytes: 1000,
    width: 1000,
    height: 800,
    ...overrides,
  };
  const [img] = await sql`insert into source_images ${sql(row)} returning *`;
  return img;
}

export async function addRegion(sql: postgres.Sql, imageId: string, i = 0) {
  const [r] = await sql`insert into regions (source_image_id, x, y, w, h)
    values (${imageId}, ${0.01 + i * 0.15}, 0.1, 0.12, 0.3) returning *`;
  return r;
}

export async function createItem(sql: postgres.Sql, category = "shoes", name = "") {
  const [it] = await sql`insert into wardrobe_items (category, name) values (${category}, ${name}) returning *`;
  return it;
}

export async function statusOf(sql: postgres.Sql, imageId: string) {
  const [r] = await sql`select audit_status from source_images where id = ${imageId}`;
  return r.audit_status as string;
}
