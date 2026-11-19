import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { addRegion, createItem, insertImage, resetDb, statusOf } from "./helpers";

let sql: postgres.Sql;

beforeAll(async () => {
  sql = await resetDb();
});
afterAll(async () => {
  await sql.end();
});

describe("display IDs", () => {
  it("assigns sequential IDs per category prefix", async () => {
    const a = await createItem(sql, "blazer");
    const b = await createItem(sql, "blazer");
    const s = await createItem(sql, "shoes");
    expect(a.display_id).toBe("BLZ-001");
    expect(b.display_id).toBe("BLZ-002");
    expect(s.display_id).toMatch(/^SHO-\d{3}$/);
  });

  it("never reuses an ID after deletion", async () => {
    const a = await createItem(sql, "accessory");
    await sql`update wardrobe_items set deleted_at = now() where id = ${a.id}`;
    const b = await createItem(sql, "accessory");
    expect(a.display_id).toBe("ACC-001");
    expect(b.display_id).toBe("ACC-002");
  });

  it("rejects changing a display ID, and keeps it when the category changes", async () => {
    const a = await createItem(sql, "top");
    await expect(sql`update wardrobe_items set display_id = 'TOP-999' where id = ${a.id}`).rejects.toThrow(
      /cannot be changed/,
    );
    const [moved] = await sql`update wardrobe_items set category = 'knitwear' where id = ${a.id} returning *`;
    expect(moved.display_id).toBe(a.display_id);
  });

  it("rejects hard deletes and client-supplied IDs", async () => {
    const a = await createItem(sql, "top");
    await expect(sql`delete from wardrobe_items where id = ${a.id}`).rejects.toThrow(/never hard-deleted/);
    await expect(sql`insert into wardrobe_items (category, display_id) values ('top', 'TOP-500')`).rejects.toThrow(
      /assigned by the database/,
    );
  });
});

describe("verification", () => {
  it("refuses photo_verified without a linked photo region", async () => {
    const a = await createItem(sql, "shoes");
    await expect(
      sql`update wardrobe_items set verification_status = 'photo_verified' where id = ${a.id}`,
    ).rejects.toThrow(/without a linked photo region/);
  });

  it("allows photo_verified once linked, and downgrades if the photo link is removed", async () => {
    const img = await insertImage(sql);
    const r = await addRegion(sql, img.id);
    const a = await createItem(sql, "shoes");
    await sql`update regions set status = 'linked', wardrobe_item_id = ${a.id} where id = ${r.id}`;
    await sql`update wardrobe_items set verification_status = 'photo_verified' where id = ${a.id}`;
    const [linked] = await sql`select primary_region_id from wardrobe_items where id = ${a.id}`;
    expect(linked.primary_region_id).toBe(r.id);

    await sql`update regions set status = 'pending', wardrobe_item_id = null where id = ${r.id}`;
    const [after] = await sql`select verification_status, primary_region_id from wardrobe_items where id = ${a.id}`;
    expect(after.verification_status).toBe("needs_review");
    expect(after.primary_region_id).toBeNull();
  });
});

describe("photo audit status", () => {
  it("starts not_started and cannot be set by the app", async () => {
    const img = await insertImage(sql);
    expect(img.audit_status).toBe("not_started");
    await sql`update source_images set audit_status = 'audited' where id = ${img.id}`;
    expect(await statusOf(sql, img.id)).toBe("not_started");
  });

  it("five shoes in one photo produce five separate records linked to that photo", async () => {
    const img = await insertImage(sql, { classification: "multi_item" });
    const regions = [];
    for (let i = 0; i < 5; i++) regions.push(await addRegion(sql, img.id, i));
    expect(await statusOf(sql, img.id)).toBe("in_progress");

    const ids = [];
    for (const r of regions) {
      const it = await createItem(sql, "shoes");
      await sql`update regions set status = 'linked', wardrobe_item_id = ${it.id} where id = ${r.id}`;
      ids.push(it.display_id);
    }
    expect(new Set(ids).size).toBe(5);
    // all boxes linked, but the user has not confirmed nothing else is in the photo
    expect(await statusOf(sql, img.id)).toBe("in_progress");
    await sql`update source_images set no_more_items_confirmed = true where id = ${img.id}`;
    expect(await statusOf(sql, img.id)).toBe("audited");

    const [{ count }] = await sql`select count(*)::int from item_images where source_image_id = ${img.id}`;
    expect(count).toBe(5);
  });

  it("an unresolved box keeps the photo unresolved, never audited", async () => {
    const img = await insertImage(sql, { classification: "multi_item", no_more_items_confirmed: true });
    const r = await addRegion(sql, img.id);
    await sql`update regions set status = 'unresolved' where id = ${r.id}`;
    expect(await statusOf(sql, img.id)).toBe("unresolved");
  });

  it("adding a new box to an audited photo reopens it", async () => {
    const img = await insertImage(sql, { classification: "garment", no_more_items_confirmed: true });
    const r = await addRegion(sql, img.id);
    const it = await createItem(sql, "top");
    await sql`update regions set status = 'linked', wardrobe_item_id = ${it.id} where id = ${r.id}`;
    expect(await statusOf(sql, img.id)).toBe("audited");
    await addRegion(sql, img.id, 1);
    expect(await statusOf(sql, img.id)).toBe("in_progress");
  });

  it("a living-room photo classified unrelated is audited with no items", async () => {
    const img = await insertImage(sql);
    await sql`update source_images set classification = 'unrelated' where id = ${img.id}`;
    expect(await statusOf(sql, img.id)).toBe("audited");
    const [{ count }] = await sql`select count(*)::int from item_images where source_image_id = ${img.id}`;
    expect(count).toBe(0);
  });

  it("a clothing photo whose boxes were all rejected is not audited", async () => {
    const img = await insertImage(sql, { classification: "garment", no_more_items_confirmed: true });
    const r = await addRegion(sql, img.id);
    await sql`update regions set status = 'rejected' where id = ${r.id}`;
    expect(await statusOf(sql, img.id)).toBe("in_progress");
  });

  it("deleting an item reopens the photo it came from", async () => {
    const img = await insertImage(sql, { classification: "garment", no_more_items_confirmed: true });
    const r = await addRegion(sql, img.id);
    const it = await createItem(sql, "top");
    await sql`update regions set status = 'linked', wardrobe_item_id = ${it.id} where id = ${r.id}`;
    expect(await statusOf(sql, img.id)).toBe("audited");
    await sql`update wardrobe_items set deleted_at = now() where id = ${it.id}`;
    expect(await statusOf(sql, img.id)).toBe("in_progress");
    await expect(
      sql`update regions set status = 'linked', wardrobe_item_id = ${it.id} where id = ${r.id}`,
    ).rejects.toThrow(/deleted item/);
  });

  it("refuses to delete source photos", async () => {
    const img = await insertImage(sql);
    await expect(sql`delete from source_images where id = ${img.id}`).rejects.toThrow(/retained/);
  });
});

describe("merge and history", () => {
  it("merges duplicates only on request, moving photos and tombstoning the duplicate", async () => {
    const img1 = await insertImage(sql, { classification: "garment", no_more_items_confirmed: true });
    const img2 = await insertImage(sql, { classification: "garment", no_more_items_confirmed: true });
    const r1 = await addRegion(sql, img1.id);
    const r2 = await addRegion(sql, img2.id);
    const keep = await createItem(sql, "shoes", "Orange Adidas");
    const dup = await createItem(sql, "shoes", "Orange Adidas (dup)");
    await sql`update regions set status = 'linked', wardrobe_item_id = ${keep.id} where id = ${r1.id}`;
    await sql`update regions set status = 'linked', wardrobe_item_id = ${dup.id} where id = ${r2.id}`;

    await sql`select merge_items(${dup.id}, ${keep.id})`;
    const [{ count }] = await sql`select count(*)::int from regions where wardrobe_item_id = ${keep.id}`;
    expect(count).toBe(2);
    const [d] = await sql`select deleted_at, merged_into, display_id from wardrobe_items where id = ${dup.id}`;
    expect(d.deleted_at).not.toBeNull();
    expect(d.merged_into).toBe(keep.id);
    expect(d.display_id).toBe(dup.display_id);
    expect(await statusOf(sql, img2.id)).toBe("audited");
  });

  it("records every change and keeps the log append-only", async () => {
    const it = await createItem(sql, "top", "Cream waffle long-sleeve");
    await sql`update wardrobe_items set brand = 'Vince' where id = ${it.id}`;
    const events = await sql`select action, old_values, new_values from audit_events
      where entity_type = 'wardrobe_items' and entity_id = ${it.id} order by id`;
    expect(events.map((e) => e.action)).toEqual(["insert", "update"]);
    expect(events[1].old_values).toEqual({ brand: "" });
    expect(events[1].new_values).toEqual({ brand: "Vince" });
    await expect(sql`delete from audit_events`).rejects.toThrow(/append-only/);
    await expect(sql`update audit_events set actor = 'x'`).rejects.toThrow(/append-only/);
  });

  it("changing a crop keeps the item link and records old coordinates", async () => {
    const img = await insertImage(sql);
    const r = await addRegion(sql, img.id);
    const it = await createItem(sql, "top");
    await sql`update regions set status = 'linked', wardrobe_item_id = ${it.id} where id = ${r.id}`;
    await sql`update regions set x = 0.2, w = 0.5 where id = ${r.id}`;
    const [still] = await sql`select wardrobe_item_id from regions where id = ${r.id}`;
    expect(still.wardrobe_item_id).toBe(it.id);
    const [ev] = await sql`select old_values, new_values from audit_events
      where entity_type = 'regions' and entity_id = ${r.id} order by id desc limit 1`;
    expect(ev.new_values).toEqual({ x: 0.2, w: 0.5 });
    expect(Object.keys(ev.old_values).sort()).toEqual(["w", "x"]);
  });
});
