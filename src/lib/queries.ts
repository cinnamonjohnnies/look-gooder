import "server-only";
import { sql } from "./db";
import type { Category, ItemOption, RegionView } from "./domain";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;

export async function getCategories(): Promise<Category[]> {
  return sql<Category[]>`select key, label, id_prefix from categories order by sort_order`;
}

export async function getAuditSummary() {
  const [img] = await sql<R[]>`
    select count(*)::int as total,
      count(*) filter (where audit_status = 'audited')::int as audited,
      count(*) filter (where audit_status = 'audited' and classification = 'unrelated')::int as unrelated,
      count(*) filter (where audit_status = 'unresolved')::int as unresolved,
      count(*) filter (where audit_status = 'in_progress')::int as in_progress,
      count(*) filter (where audit_status = 'not_started')::int as not_started
    from source_images`;
  const [items] = await sql<R[]>`
    select count(*) filter (where deleted_at is null)::int as total,
      count(*) filter (where deleted_at is null and verification_status = 'photo_verified')::int as verified,
      count(*) filter (where deleted_at is null and verification_status = 'description_confirmed')::int as described,
      count(*) filter (where deleted_at is null and verification_status = 'candidate')::int as candidates,
      count(*) filter (where deleted_at is null and verification_status = 'needs_review')::int as needs_review,
      count(*) filter (where deleted_at is null and verification_status = 'archived')::int as archived
    from wardrobe_items`;
  const [regions] = await sql<R[]>`
    select count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'unresolved')::int as unresolved
    from regions`;
  const complete =
    img.total > 0 && img.audited === img.total && items.candidates === 0 && items.needs_review === 0 && regions.pending === 0;
  return { images: img, items, regions, complete };
}

export async function listSourceImages(status?: string) {
  return sql<R[]>`
    select s.id, s.original_filename, s.classification, s.audit_status, s.uploaded_at, s.width, s.height,
      (select count(*)::int from regions r where r.source_image_id = s.id) as region_count,
      (select count(*)::int from regions r where r.source_image_id = s.id and r.status = 'linked') as linked_count,
      (select count(*)::int from regions r where r.source_image_id = s.id and r.status in ('pending','unresolved')) as open_count
    from source_images s
    where ${status ? sql`s.audit_status = ${status}` : sql`true`}
    order by s.uploaded_at desc, s.original_filename`;
}

export async function getSourceImage(id: string) {
  const [img] = await sql<R[]>`select * from source_images where id = ${id}`;
  return img ?? null;
}

export async function getRegions(imageId: string): Promise<RegionView[]> {
  const rows = await sql<R[]>`
    select r.id, r.x, r.y, r.w, r.h, r.status, r.label, r.notes, r.updated_at,
      wi.id as item_id, wi.display_id, wi.name, wi.brand, wi.category, wi.verification_status
    from regions r left join wardrobe_items wi on wi.id = r.wardrobe_item_id
    where r.source_image_id = ${imageId}
    order by r.created_at, r.id`;
  return rows.map((r) => ({
    id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, status: r.status, label: r.label, notes: r.notes,
    version: `${r.x.toFixed(5)}-${r.y.toFixed(5)}-${r.w.toFixed(5)}-${r.h.toFixed(5)}`,
    item: r.item_id
      ? { id: r.item_id, display_id: r.display_id, name: r.name, brand: r.brand, category: r.category, verification_status: r.verification_status }
      : null,
  }));
}

/** Neighbouring photos that still need work, for "next photo" navigation. */
export async function getNextOpenImage(currentId: string) {
  const [next] = await sql<R[]>`
    select id from source_images
    where id <> ${currentId} and audit_status <> 'audited'
    order by (audit_status = 'not_started') desc, uploaded_at desc, original_filename limit 1`;
  return (next?.id as string) ?? null;
}

const itemThumb = () => sql`
  (select r.id || '|' || to_char(r.x, 'FM0.00000') || '-' || to_char(r.y, 'FM0.00000') || '-' ||
          to_char(r.w, 'FM0.00000') || '-' || to_char(r.h, 'FM0.00000')
   from regions r where r.id = wi.primary_region_id) as thumb_ref`;

function toThumb(ref: string | null) {
  if (!ref) return null;
  const [id, version] = ref.split("|");
  return `/api/images/region/${id}?size=480&v=${encodeURIComponent(version)}`;
}

export async function listItemOptions(): Promise<ItemOption[]> {
  const rows = await sql<R[]>`
    select wi.id, wi.display_id, wi.name, wi.brand, wi.category, wi.primary_color, wi.verification_status, ${itemThumb()}
    from wardrobe_items wi where wi.deleted_at is null
    order by wi.category, wi.display_id`;
  return rows.map((r) => ({ ...(r as unknown as ItemOption), thumb: toThumb(r.thumb_ref) }));
}

export type ClosetFilters = { q?: string; category?: string; status?: string; color?: string; brand?: string };

export async function listCloset(f: ClosetFilters) {
  const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
  const rows = await sql<R[]>`
    select wi.id, wi.display_id, wi.name, wi.brand, wi.category, wi.primary_color, wi.material, wi.fit,
      wi.verification_status, ${itemThumb()},
      (select count(*)::int from regions r where r.wardrobe_item_id = wi.id and r.status = 'linked') as photo_count
    from wardrobe_items wi
    where wi.deleted_at is null
      and ${f.status ? sql`wi.verification_status = ${f.status}` : sql`wi.verification_status <> 'archived'`}
      and ${f.category ? sql`wi.category = ${f.category}` : sql`true`}
      and ${f.color ? sql`(wi.primary_color ilike ${f.color} or ${f.color} ilike any(wi.secondary_colors))` : sql`true`}
      and ${f.brand ? sql`wi.brand ilike ${f.brand}` : sql`true`}
      and ${q ? sql`(wi.name ilike ${q} or wi.brand ilike ${q} or wi.display_id ilike ${q} or wi.description ilike ${q}
                    or wi.primary_color ilike ${q} or wi.material ilike ${q} or wi.subcategory ilike ${q})` : sql`true`}
    order by wi.category, wi.display_id`;
  return rows.map((r) => ({ ...r, thumb: toThumb(r.thumb_ref) }) as R);
}

export async function getClosetFacets() {
  const colors = await sql<{ v: string }[]>`select distinct lower(primary_color) as v from wardrobe_items
    where deleted_at is null and primary_color <> '' order by 1`;
  const brands = await sql<{ v: string }[]>`select distinct brand as v from wardrobe_items
    where deleted_at is null and brand <> '' order by 1`;
  return { colors: colors.map((c) => c.v), brands: brands.map((b) => b.v) };
}

export async function getItem(id: string) {
  const [item] = await sql<R[]>`select wi.*, m.display_id as merged_into_display_id
    from wardrobe_items wi left join wardrobe_items m on m.id = wi.merged_into where wi.id = ${id}`;
  if (!item) return null;
  const photos = await sql<R[]>`
    select r.id, r.x, r.y, r.w, r.h, r.source_image_id, s.original_filename, s.classification, s.audit_status
    from regions r join source_images s on s.id = r.source_image_id
    where r.wardrobe_item_id = ${id} and r.status = 'linked' order by r.created_at`;
  const history = await sql<R[]>`
    select id, occurred_at, actor, entity_type, action, old_values, new_values, note, source_image_id
    from audit_events where wardrobe_item_id = ${id} or (entity_type = 'wardrobe_items' and entity_id = ${id})
    order by id desc limit 200`;
  return {
    item,
    photos: photos.map((p): R => ({
      ...p,
      version: `${p.x.toFixed(5)}-${p.y.toFixed(5)}-${p.w.toFixed(5)}-${p.h.toFixed(5)}`,
    })),
    history,
  };
}

/** Same category and color, compatible brand: possible duplicates to review. Suggestions only. */
export async function getDuplicateSuggestions(id: string) {
  const rows = await sql<R[]>`
    select o.id, o.display_id, o.name, o.brand, o.category, o.primary_color, o.verification_status,
      (select r.id || '|' || to_char(r.x, 'FM0.00000') || '-' || to_char(r.y, 'FM0.00000') || '-' ||
              to_char(r.w, 'FM0.00000') || '-' || to_char(r.h, 'FM0.00000')
       from regions r where r.id = o.primary_region_id) as thumb_ref
    from wardrobe_items wi join wardrobe_items o
      on o.category = wi.category and o.id <> wi.id and o.deleted_at is null
    where wi.id = ${id}
      and wi.primary_color <> '' and lower(o.primary_color) = lower(wi.primary_color)
      and (o.brand = '' or wi.brand = '' or lower(o.brand) = lower(wi.brand))
    order by o.display_id limit 12`;
  return rows.map((r) => ({ ...r, thumb: toThumb(r.thumb_ref) }) as R);
}

export async function getChecklist() {
  const entries = await sql<R[]>`
    select e.*, c.label as category_label,
      coalesce(json_agg(json_build_object('id', wi.id, 'display_id', wi.display_id, 'name', wi.name,
        'brand', wi.brand, 'verification_status', wi.verification_status))
        filter (where wi.id is not null), '[]') as items
    from expected_items e
    join categories c on c.key = e.category
    left join expected_item_links l on l.expected_item_id = e.id
    left join wardrobe_items wi on wi.id = l.wardrobe_item_id and wi.deleted_at is null
    group by e.id, c.label, c.sort_order
    order by c.sort_order, e.sort_order, e.created_at`;
  return entries;
}
