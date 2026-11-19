# Look Gooder

A personal wardrobe inventory and styling assistant that only knows what you actually own, verified from your own photos.

**Phase 1 (this version):** photo import and audit, manual boxing of every item in multi-item photos, the wardrobe closet, item editing with full history, the expected-items checklist, and full backup export. There is no AI yet. Phase 2 adds AI that pre-fills the same boxes, which you then review.

To deploy, see **[DEPLOY.md](DEPLOY.md)**.

## How completeness is enforced

These rules live in the database (`db/migrations/001_foundation.sql`), so no screen or future AI feature can bypass them:

- **Every visible item is a box.** Each box on a source photo must end **linked** to an item, **rejected** (not wardrobe), or **unresolved**.
- **Audit status is computed, never set.** A photo is *audited* only when it is classified, every box is decided, and you have confirmed every wardrobe item in it is boxed. Unrelated photos are audited with zero items. The app cannot write this status directly.
- **IDs are permanent.** `SHO-014` is assigned once, never reused (even after deletion) and never renumbered. Changing an item's category keeps its ID.
- **Photo verified requires a photo.** The database refuses `photo_verified` unless the item is linked to a box on a real photo. If that link is removed, the item drops to *needs review*.
- **Nothing is silently merged or deleted.** Exact duplicate uploads are detected by file fingerprint and reported. Merging only happens when you choose it. Items are tombstoned, never hard-deleted. Source photos cannot be deleted.
- **Append-only history.** Every change to items, boxes, and photos is logged with old and new values. The log itself cannot be edited.
- **Originals are untouched.** Crops are stored as coordinates on the original photo, so editing a crop never breaks links.

## Structure

```
db/migrations/        SQL schema and rules
scripts/migrate.ts    applies migrations (npm run migrate)
src/lib/              database, storage adapter, photo ingestion, queries
src/app/actions.ts    all mutations (validated server actions)
src/app/api/          uploads, image serving and crops, backup export
src/app/(app)/        Closet, Import & Audit, review, checklist
src/components/       UI, including the box editor (region-editor.tsx)
tests/                database rule tests and pipeline tests (Vitest)
tests/e2e/            browser walkthrough (Playwright)
```

## Local development

Requires Node 20+ and PostgreSQL.

```
cp .env.example .env.local      # fill in DATABASE_URL, APP_PASSWORD, SESSION_SECRET
npm install
npm run migrate
npm run dev
```

## Tests

```
npm test                                          # 24 rule and pipeline tests (uses lookgooder_test database)
BASE=http://localhost:3000 node tests/e2e/walkthrough.mjs   # browser walkthrough
```

Tests use generated plain shapes, never garment images, and run against a separate test database.
