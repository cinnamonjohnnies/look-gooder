-- Look Gooder Phase 1 foundation schema.
-- Core rules live in the database so no code path can bypass them:
--   * display IDs are assigned once, never reused, never changed
--   * source-photo audit status is computed, never set by the app
--   * photo_verified requires a linked photo region
--   * every change is written to an append-only audit log

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type verification_status as enum
  ('candidate', 'photo_verified', 'description_confirmed', 'needs_review', 'archived');

create type image_classification as enum
  ('unclassified', 'garment', 'multi_item', 'try_on', 'unrelated', 'needs_review');

create type region_status as enum ('pending', 'linked', 'rejected', 'unresolved');

create type audit_status as enum ('not_started', 'in_progress', 'unresolved', 'audited');

-- ---------------------------------------------------------- categories
create table categories (
  key        text primary key,
  label      text not null,
  id_prefix  text not null check (id_prefix ~ '^[A-Z]{3}$'),
  sort_order int  not null default 0
);

insert into categories (key, label, id_prefix, sort_order) values
  ('blazer',    'Blazers & sport coats', 'BLZ', 10),
  ('suit',      'Suits',                 'SUT', 20),
  ('top',       'Tops & shirts',         'TOP', 30),
  ('knitwear',  'Knitwear',              'KNT', 40),
  ('denim',     'Denim',                 'DEN', 50),
  ('trousers',  'Trousers & shorts',     'TRS', 60),
  ('outerwear', 'Outerwear',             'OUT', 70),
  ('shoes',     'Shoes',                 'SHO', 80),
  ('accessory', 'Accessories',           'ACC', 90);

-- One counter per prefix. Counters only move forward, so IDs are never reused.
create table id_sequences (
  prefix     text primary key,
  next_value int  not null default 1 check (next_value >= 1)
);

-- --------------------------------------------------------- source images
create table source_images (
  id                      uuid primary key default gen_random_uuid(),
  sha256                  text not null unique,
  original_filename       text not null,
  original_path           text not null,
  display_path            text not null,
  thumb_path              text not null,
  mime_type               text not null,
  bytes                   bigint not null,
  width                   int  not null,   -- display image, orientation applied
  height                  int  not null,
  source_type             text not null default 'upload',
  classification          image_classification not null default 'unclassified',
  no_more_items_confirmed boolean not null default false,
  audit_status            audit_status not null default 'not_started', -- computed by trigger
  notes                   text not null default '',
  uploaded_at             timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  audited_at              timestamptz
);

-- ------------------------------------------------------- wardrobe items
create table wardrobe_items (
  id                    uuid primary key default gen_random_uuid(),
  display_id            text unique,           -- assigned by trigger, immutable
  category              text not null references categories(key),
  subcategory           text not null default '',
  brand                 text not null default '',
  name                  text not null default '',
  primary_color         text not null default '',
  secondary_colors      text[] not null default '{}',
  material              text not null default '',
  texture               text not null default '',
  fit                   text not null default '',
  silhouette            text not null default '',
  formality             smallint check (formality between 1 and 5),
  season                text[] not null default '{}',
  warmth_level          smallint check (warmth_level between 1 and 5),
  description           text not null default '',
  styling_notes         text not null default '',
  verification_status   verification_status not null default 'candidate',
  status_before_archive verification_status,
  primary_region_id     uuid,
  merged_into           uuid references wardrobe_items(id),
  deleted_at            timestamptz,           -- tombstone; rows are never hard-deleted
  active                boolean generated always as
                          (verification_status <> 'archived' and deleted_at is null) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index wardrobe_items_category_idx on wardrobe_items (category) where deleted_at is null;

-- ---------------------------------------------------------------- regions
-- A region is one box on one source photo. Every visible wardrobe item in a
-- photo gets a region, and every region must end linked, rejected, or unresolved.
create table regions (
  id               uuid primary key default gen_random_uuid(),
  source_image_id  uuid not null references source_images(id) on delete restrict,
  x double precision not null check (x >= 0 and x <= 1),
  y double precision not null check (y >= 0 and y <= 1),
  w double precision not null check (w > 0 and x + w <= 1.000001),
  h double precision not null check (h > 0 and y + h <= 1.000001),
  label            text not null default '',
  status           region_status not null default 'pending',
  wardrobe_item_id uuid references wardrobe_items(id),
  image_role       text not null default 'crop',
  created_by       text not null default 'user' check (created_by in ('user', 'ai')),
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint linked_has_item check ((status = 'linked') = (wardrobe_item_id is not null))
);

create index regions_image_idx on regions (source_image_id);
create index regions_item_idx  on regions (wardrobe_item_id);

alter table wardrobe_items
  add constraint primary_region_fk foreign key (primary_region_id) references regions(id);

-- The brief's item_images concept, derived from linked regions.
create view item_images as
  select r.id, r.wardrobe_item_id, r.source_image_id,
         jsonb_build_object('x', r.x, 'y', r.y, 'w', r.w, 'h', r.h) as crop_coordinates,
         r.image_role,
         (wi.primary_region_id = r.id) as is_primary
  from regions r
  join wardrobe_items wi on wi.id = r.wardrobe_item_id
  where r.status = 'linked';

-- ------------------------------------------------------ expected checklist
-- Not inventory. Expectations used only to reveal gaps in the audit.
create table expected_items (
  id             uuid primary key default gen_random_uuid(),
  category       text not null references categories(key),
  description    text not null,
  expected_count int  not null default 1 check (expected_count >= 1),
  notes          text not null default '',
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now()
);

create table expected_item_links (
  expected_item_id uuid not null references expected_items(id) on delete cascade,
  wardrobe_item_id uuid not null references wardrobe_items(id),
  primary key (expected_item_id, wardrobe_item_id)
);

-- ------------------------------------------------------------ audit log
create table audit_events (
  id               bigserial primary key,
  occurred_at      timestamptz not null default now(),
  actor            text not null,
  entity_type      text not null,
  entity_id        uuid not null,
  action           text not null,
  old_values       jsonb,
  new_values       jsonb,
  source_image_id  uuid,
  wardrobe_item_id uuid,
  note             text not null default ''
);

create index audit_events_item_idx  on audit_events (wardrobe_item_id, occurred_at desc);
create index audit_events_image_idx on audit_events (source_image_id, occurred_at desc);

create function audit_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end $$;

create trigger audit_events_no_update before update or delete on audit_events
  for each row execute function audit_events_append_only();

-- Generic change logger. Records only changed columns.
create function log_change() returns trigger language plpgsql as $$
declare
  old_j jsonb;
  new_j jsonb;
  diff_old jsonb := '{}';
  diff_new jsonb := '{}';
  k text;
  ignored text[] := array['updated_at', 'active'];
  img uuid;
  itm uuid;
begin
  if tg_op = 'INSERT' then
    new_j := to_jsonb(new) - ignored;
    diff_new := new_j;
  elsif tg_op = 'UPDATE' then
    old_j := to_jsonb(old) - ignored;
    new_j := to_jsonb(new) - ignored;
    for k in select jsonb_object_keys(new_j) loop
      if old_j -> k is distinct from new_j -> k then
        diff_old := diff_old || jsonb_build_object(k, old_j -> k);
        diff_new := diff_new || jsonb_build_object(k, new_j -> k);
      end if;
    end loop;
    if diff_new = '{}'::jsonb then
      return new;
    end if;
  else
    diff_old := to_jsonb(old) - ignored;
  end if;

  if tg_table_name = 'wardrobe_items' then
    itm := coalesce(new.id, old.id);
  elsif tg_table_name = 'regions' then
    img := coalesce(new.source_image_id, old.source_image_id);
    itm := coalesce(new.wardrobe_item_id, old.wardrobe_item_id);
  elsif tg_table_name = 'source_images' then
    img := coalesce(new.id, old.id);
  end if;

  insert into audit_events (actor, entity_type, entity_id, action, old_values, new_values,
                            source_image_id, wardrobe_item_id, note)
  values (coalesce(nullif(current_setting('app.actor', true), ''), 'user'),
          tg_table_name, coalesce(new.id, old.id), lower(tg_op),
          nullif(diff_old, '{}'::jsonb), nullif(diff_new, '{}'::jsonb),
          img, itm, coalesce(current_setting('app.note', true), ''));

  return coalesce(new, old);
end $$;

-- -------------------------------------------------- display ID handling
create function assign_display_id() returns trigger language plpgsql as $$
declare
  pfx text;
  n   int;
begin
  if new.display_id is not null then
    raise exception 'display_id is assigned by the database';
  end if;
  select id_prefix into pfx from categories where key = new.category;
  insert into id_sequences (prefix, next_value) values (pfx, 2)
    on conflict (prefix) do update set next_value = id_sequences.next_value + 1
    returning next_value - 1 into n;
  new.display_id := pfx || '-' || lpad(n::text, 3, '0');
  return new;
end $$;

create trigger wardrobe_items_assign_id before insert on wardrobe_items
  for each row execute function assign_display_id();

create function guard_wardrobe_item() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wardrobe items are never hard-deleted; set deleted_at instead';
  end if;
  if new.display_id is distinct from old.display_id then
    raise exception 'display_id % cannot be changed', old.display_id;
  end if;
  if old.deleted_at is not null and new.deleted_at is null and old.merged_into is not null then
    raise exception 'merged items cannot be restored';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger wardrobe_items_guard before update or delete on wardrobe_items
  for each row execute function guard_wardrobe_item();

-- photo_verified requires at least one linked region on a real photo.
create function check_photo_verified() returns trigger language plpgsql as $$
begin
  -- deferred: check the row's state at commit, not the state when queued
  if exists (select 1 from wardrobe_items where id = new.id and verification_status = 'photo_verified')
     and not exists (
       select 1 from regions where wardrobe_item_id = new.id and status = 'linked') then
    raise exception 'item % cannot be photo verified without a linked photo region', new.display_id;
  end if;
  return new;
end $$;

create constraint trigger wardrobe_items_photo_verified
  after insert or update on wardrobe_items
  deferrable initially deferred
  for each row execute function check_photo_verified();

-- When an item is deleted, its photo regions return to pending so the photo
-- is truthfully no longer fully accounted for.
create function release_regions_on_delete() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and new.merged_into is null then
    update regions set status = 'pending', wardrobe_item_id = null
      where wardrobe_item_id = new.id;
    update wardrobe_items set primary_region_id = null where id = new.id and primary_region_id is not null;
  end if;
  return null;
end $$;

create trigger wardrobe_items_release_regions after update of deleted_at on wardrobe_items
  for each row execute function release_regions_on_delete();

-- ------------------------------------------------------ region handling
create function guard_region() returns trigger language plpgsql as $$
begin
  if new.wardrobe_item_id is not null and exists (
       select 1 from wardrobe_items where id = new.wardrobe_item_id and deleted_at is not null) then
    raise exception 'cannot link a photo region to a deleted item';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger regions_guard before insert or update on regions
  for each row execute function guard_region();

-- After a region changes: keep item primary images valid, downgrade items that
-- lost their only photo, and recompute the parent photo's audit status.
create function after_region_change() returns trigger language plpgsql as $$
declare
  affected uuid[];
  item uuid;
begin
  affected := array_remove(array[
    case when tg_op <> 'INSERT' then old.wardrobe_item_id end,
    case when tg_op <> 'DELETE' then new.wardrobe_item_id end], null);

  foreach item in array affected loop
    -- primary image must be one of the item's linked regions
    update wardrobe_items wi set primary_region_id = (
        select r.id from regions r where r.wardrobe_item_id = wi.id and r.status = 'linked'
        order by (r.id = wi.primary_region_id) desc, r.created_at limit 1)
      where wi.id = item
        and wi.primary_region_id is distinct from (
          select r.id from regions r where r.wardrobe_item_id = wi.id and r.status = 'linked'
          order by (r.id = wi.primary_region_id) desc, r.created_at limit 1);
    -- an item that lost every photo can no longer be photo verified
    update wardrobe_items set verification_status = 'needs_review'
      where id = item and verification_status = 'photo_verified'
        and not exists (select 1 from regions where wardrobe_item_id = item and status = 'linked');
  end loop;

  update source_images set updated_at = now()
    where id in (case when tg_op <> 'INSERT' then old.source_image_id end,
                 case when tg_op <> 'DELETE' then new.source_image_id end);
  return null;
end $$;

create trigger regions_after_change after insert or update or delete on regions
  for each row execute function after_region_change();

-- -------------------------------------------- computed photo audit status
create function compute_audit_status(img source_images) returns audit_status
language plpgsql stable as $$
declare
  n_pending int; n_unresolved int; n_linked int; n_total int;
begin
  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'unresolved'),
         count(*) filter (where status = 'linked'),
         count(*)
    into n_pending, n_unresolved, n_linked, n_total
    from regions where source_image_id = img.id;

  if img.classification = 'unrelated' then
    if n_pending + n_unresolved + n_linked = 0 then return 'audited'; end if;
    return 'in_progress';
  end if;
  if img.classification = 'unclassified' and n_total = 0 then return 'not_started'; end if;
  if img.classification = 'needs_review' then return 'unresolved'; end if;
  if n_pending > 0 then return 'in_progress'; end if;
  if n_unresolved > 0 then return 'unresolved'; end if;
  if img.classification = 'unclassified' then return 'in_progress'; end if;
  if not img.no_more_items_confirmed then return 'in_progress'; end if;
  if n_linked = 0 then return 'in_progress'; end if; -- clothing photo with no items
  return 'audited';
end $$;

create function set_audit_status() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  new.audit_status := compute_audit_status(new);
  if new.audit_status = 'audited' then
    new.audited_at := coalesce(case when tg_op = 'UPDATE' and old.audit_status = 'audited'
                                    then old.audited_at end, now());
  else
    new.audited_at := null;
  end if;
  return new;
end $$;

create trigger source_images_audit_status before insert or update on source_images
  for each row execute function set_audit_status();

create function guard_source_image_delete() returns trigger language plpgsql as $$
begin
  raise exception 'source photos are retained; classify as unrelated instead of deleting';
end $$;

create trigger source_images_no_delete before delete on source_images
  for each row execute function guard_source_image_delete();

-- ---------------------------------------------------------- merge items
-- Moves every photo region from one item to another and tombstones the source.
create function merge_items(from_id uuid, into_id uuid) returns void language plpgsql as $$
begin
  if from_id = into_id then raise exception 'cannot merge an item into itself'; end if;
  if exists (select 1 from wardrobe_items where id in (from_id, into_id) and deleted_at is not null) then
    raise exception 'cannot merge deleted items';
  end if;
  perform set_config('app.note', 'merge', true);
  update regions set wardrobe_item_id = into_id where wardrobe_item_id = from_id;
  insert into expected_item_links (expected_item_id, wardrobe_item_id)
    select expected_item_id, into_id from expected_item_links where wardrobe_item_id = from_id
    on conflict do nothing;
  delete from expected_item_links where wardrobe_item_id = from_id;
  update wardrobe_items set merged_into = into_id, deleted_at = now(), primary_region_id = null
    where id = from_id;
end $$;

-- ------------------------------------------------------------ logging
create trigger wardrobe_items_log after insert or update on wardrobe_items
  for each row execute function log_change();
create trigger regions_log after insert or update or delete on regions
  for each row execute function log_change();
create trigger source_images_log after insert or update on source_images
  for each row execute function log_change();

-- ------------------------------------------------------------- lockdown
-- Supabase exposes the public schema through its REST API. Enable RLS with no
-- policies so that API is closed; the app connects directly as the owner.
alter table categories          enable row level security;
alter table id_sequences        enable row level security;
alter table source_images       enable row level security;
alter table wardrobe_items      enable row level security;
alter table regions             enable row level security;
alter table expected_items      enable row level security;
alter table expected_item_links enable row level security;
alter table audit_events        enable row level security;
alter view item_images set (security_invoker = true);

-- Lets this file be pasted into the Supabase SQL editor and still be tracked.
create table if not exists schema_migrations (
  name text primary key, applied_at timestamptz not null default now());
alter table schema_migrations enable row level security;
insert into schema_migrations (name) values ('001_foundation.sql') on conflict do nothing;
