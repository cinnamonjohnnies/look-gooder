"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { sql, tx } from "@/lib/db";
import { assertAuthed, endSession, passwordMatches, startSession } from "@/lib/auth";
import { STARTER_CHECKLIST } from "@/lib/checklist-seed";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const uuid = z.string().uuid();
const box = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0.005).max(1), h: z.number().min(0.005).max(1) })
  .refine((b) => b.x + b.w <= 1.000001 && b.y + b.h <= 1.000001, "box must stay inside the photo");

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    await assertAuthed();
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong";
    return { ok: false, error: msg.replace(/^.*?ERROR:\s*/, "") };
  }
}

// ------------------------------------------------------------------ session
export async function login(_: unknown, form: FormData) {
  const pw = String(form.get("password") ?? "");
  if (!pw || !passwordMatches(pw)) return { error: "That password is not right." };
  await startSession();
  redirect("/import");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

// ------------------------------------------------------------ source photos
const classification = z.enum(["unclassified", "garment", "multi_item", "try_on", "unrelated", "needs_review"]);

export async function setClassification(imageId: string, value: string) {
  return run(async () => {
    await sql`update source_images set classification = ${classification.parse(value)} where id = ${uuid.parse(imageId)}`;
  });
}

export async function setNoMoreItems(imageId: string, value: boolean) {
  return run(async () => {
    await sql`update source_images set no_more_items_confirmed = ${z.boolean().parse(value)} where id = ${uuid.parse(imageId)}`;
  });
}

export async function setImageNotes(imageId: string, notes: string) {
  return run(async () => {
    await sql`update source_images set notes = ${z.string().max(2000).parse(notes)} where id = ${uuid.parse(imageId)}`;
  });
}

// ------------------------------------------------------------------ regions
export async function createRegion(imageId: string, b: z.infer<typeof box>) {
  return run(async () => {
    const v = box.parse(b);
    const [r] = await sql`insert into regions (source_image_id, x, y, w, h)
      values (${uuid.parse(imageId)}, ${v.x}, ${v.y}, ${v.w}, ${v.h}) returning id`;
    return r.id as string;
  });
}

export async function updateRegionBox(regionId: string, b: z.infer<typeof box>) {
  return run(async () => {
    const v = box.parse(b);
    await sql`update regions set x = ${v.x}, y = ${v.y}, w = ${v.w}, h = ${v.h} where id = ${uuid.parse(regionId)}`;
  });
}

export async function updateRegionNote(regionId: string, label: string, notes: string) {
  return run(async () => {
    await sql`update regions set label = ${z.string().max(200).parse(label)}, notes = ${z.string().max(2000).parse(notes)}
      where id = ${uuid.parse(regionId)}`;
  });
}

export async function setRegionStatus(regionId: string, status: "pending" | "rejected" | "unresolved") {
  return run(async () => {
    const s = z.enum(["pending", "rejected", "unresolved"]).parse(status);
    await sql`update regions set status = ${s}, wardrobe_item_id = null where id = ${uuid.parse(regionId)}`;
  });
}

export async function deleteRegion(regionId: string) {
  return run(async () => {
    await tx(async (t) => {
      const id = uuid.parse(regionId);
      await t`update wardrobe_items set primary_region_id = null where primary_region_id = ${id}`;
      await t`update regions set status = 'pending', wardrobe_item_id = null where id = ${id} and status = 'linked'`;
      await t`delete from regions where id = ${id}`;
    }, "box deleted");
  });
}

const itemFields = z.object({
  category: z.string().min(1).max(40),
  subcategory: z.string().max(80).default(""),
  brand: z.string().max(80).default(""),
  name: z.string().max(120).default(""),
  primary_color: z.string().max(40).default(""),
  secondary_colors: z.array(z.string().max(40)).max(10).default([]),
  material: z.string().max(80).default(""),
  texture: z.string().max(80).default(""),
  fit: z.string().max(80).default(""),
  silhouette: z.string().max(80).default(""),
  formality: z.number().int().min(1).max(5).nullable().default(null),
  season: z.array(z.enum(["spring", "summer", "fall", "winter"])).default([]),
  warmth_level: z.number().int().min(1).max(5).nullable().default(null),
  description: z.string().max(4000).default(""),
  styling_notes: z.string().max(4000).default(""),
});
export type ItemFields = z.input<typeof itemFields>;

/** Creates a new item from a box. verify=true means you approved it against this photo. */
export async function createItemFromRegion(regionId: string, fields: ItemFields, verify: boolean) {
  return run(async () => {
    const f = itemFields.parse(fields);
    return tx(async (t) => {
      const [it] = await t`insert into wardrobe_items ${t(f)} returning id, display_id`;
      await t`update regions set status = 'linked', wardrobe_item_id = ${it.id} where id = ${uuid.parse(regionId)}`;
      if (verify) await t`update wardrobe_items set verification_status = 'photo_verified' where id = ${it.id}`;
      return it.display_id as string;
    });
  });
}

export async function linkRegionToItem(regionId: string, itemId: string) {
  return run(async () => {
    await sql`update regions set status = 'linked', wardrobe_item_id = ${uuid.parse(itemId)} where id = ${uuid.parse(regionId)}`;
  });
}

// -------------------------------------------------------------------- items
export async function createItemManually(fields: ItemFields) {
  return run(async () => {
    const f = itemFields.parse(fields);
    const [it] = await sql`insert into wardrobe_items ${sql(f)} returning id`;
    return it.id as string;
  });
}

export async function updateItem(itemId: string, fields: ItemFields) {
  return run(async () => {
    const f = itemFields.parse(fields);
    await sql`update wardrobe_items set ${sql(f)} where id = ${uuid.parse(itemId)} and deleted_at is null`;
  });
}

export async function setItemStatus(
  itemId: string,
  action: "photo_verified" | "description_confirmed" | "needs_review" | "candidate" | "archive" | "unarchive",
) {
  return run(async () => {
    const id = uuid.parse(itemId);
    if (action === "archive") {
      await sql`update wardrobe_items set status_before_archive = verification_status, verification_status = 'archived'
        where id = ${id} and verification_status <> 'archived'`;
    } else if (action === "unarchive") {
      await sql`update wardrobe_items set verification_status = coalesce(status_before_archive, 'needs_review'),
        status_before_archive = null where id = ${id} and verification_status = 'archived'`;
    } else {
      const s = z.enum(["photo_verified", "description_confirmed", "needs_review", "candidate"]).parse(action);
      await sql`update wardrobe_items set verification_status = ${s} where id = ${id}`;
    }
  });
}

export async function setPrimaryRegion(itemId: string, regionId: string) {
  return run(async () => {
    await sql`update wardrobe_items set primary_region_id = ${uuid.parse(regionId)}
      where id = ${uuid.parse(itemId)} and exists (select 1 from regions where id = ${regionId}
        and wardrobe_item_id = ${itemId} and status = 'linked')`;
  });
}

export async function deleteItem(itemId: string) {
  return run(async () => {
    await tx(async (t) => {
      await t`update wardrobe_items set deleted_at = now() where id = ${uuid.parse(itemId)} and deleted_at is null`;
    }, "item deleted");
  });
}

export async function mergeItem(fromId: string, intoId: string) {
  return run(async () => {
    await sql`select merge_items(${uuid.parse(fromId)}, ${uuid.parse(intoId)})`;
  });
}

// ---------------------------------------------------------------- checklist
export async function loadStarterChecklist() {
  return run(async () => {
    await tx(async (t) => {
      const [{ n }] = await t`select count(*)::int as n from expected_items`;
      if (n > 0) throw new Error("The checklist already has entries");
      let i = 0;
      for (const e of STARTER_CHECKLIST) {
        await t`insert into expected_items (category, description, expected_count, notes, sort_order)
          values (${e.category}, ${e.description}, ${e.count ?? 1}, ${e.notes ?? ""}, ${i++})`;
      }
    });
  });
}

export async function addExpected(category: string, description: string, count: number) {
  return run(async () => {
    await sql`insert into expected_items (category, description, expected_count, sort_order)
      values (${z.string().parse(category)}, ${z.string().min(1).max(300).parse(description)},
              ${z.number().int().min(1).max(500).parse(count)}, 1000)`;
  });
}

export async function updateExpectedCount(id: string, count: number) {
  return run(async () => {
    await sql`update expected_items set expected_count = ${z.number().int().min(1).max(500).parse(count)} where id = ${uuid.parse(id)}`;
  });
}

export async function deleteExpected(id: string) {
  return run(async () => {
    await sql`delete from expected_items where id = ${uuid.parse(id)}`;
  });
}

export async function linkExpected(expectedId: string, itemId: string) {
  return run(async () => {
    await sql`insert into expected_item_links (expected_item_id, wardrobe_item_id)
      values (${uuid.parse(expectedId)}, ${uuid.parse(itemId)}) on conflict do nothing`;
  });
}

export async function unlinkExpected(expectedId: string, itemId: string) {
  return run(async () => {
    await sql`delete from expected_item_links where expected_item_id = ${uuid.parse(expectedId)} and wardrobe_item_id = ${uuid.parse(itemId)}`;
  });
}
