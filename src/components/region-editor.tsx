"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createItemFromRegion,
  createRegion,
  deleteRegion,
  linkRegionToItem,
  setClassification,
  setItemStatus,
  setNoMoreItems,
  setRegionStatus,
  updateRegionBox,
  updateRegionNote,
} from "@/app/actions";
import {
  CLASSIFICATION,
  REGION,
  regionImageUrl,
  sourceImageUrl,
  type AuditStatus,
  type Box,
  type Category,
  type Classification,
  type ItemOption,
  type RegionView, classificationOf, regionOf } from "@/lib/domain";
import { AuditBadge, VerificationBadge } from "./badge";
import { ItemQuickForm } from "./item-quick-form";
import { ItemPicker } from "./item-picker";

type Img = {
  id: string;
  width: number;
  height: number;
  classification: Classification;
  no_more_items_confirmed: boolean;
  audit_status: AuditStatus;
  original_filename: string;
};

type Drag =
  | { kind: "draw"; startX: number; startY: number; box: Box }
  | { kind: "move"; id: string; startX: number; startY: number; orig: Box; box: Box }
  | { kind: "resize"; id: string; corner: "nw" | "ne" | "sw" | "se"; orig: Box; box: Box };

const MIN = 0.01;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (b: Box): Box => ({ x: +b.x.toFixed(5), y: +b.y.toFixed(5), w: +b.w.toFixed(5), h: +b.h.toFixed(5) });

export function RegionEditor(props: {
  image: Img;
  regions: RegionView[];
  categories: Category[];
  items: ItemOption[];
  nextId: string | null;
}) {
  const { image, regions, categories, items, nextId } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Box>>({});
  const [ghost, setGhost] = useState<Box | null>(null);
  const [drawMode, setDrawMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "new" | "link">("none");
  const canvas = useRef<HTMLDivElement>(null);

  // drop local overrides once the server has the new coordinates
  const [seenRegions, setSeenRegions] = useState(regions);
  if (seenRegions !== regions) {
    setSeenRegions(regions);
    setOverrides({});
    setGhost(null);
  }

  const boxes = useMemo(
    () => regions.map((r, i) => ({ ...r, n: i + 1, box: overrides[r.id] ?? { x: r.x, y: r.y, w: r.w, h: r.h } })),
    [regions, overrides],
  );
  const sel = boxes.find((b) => b.id === selected) ?? null;

  const act = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (data: unknown) => void) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      else after?.(res.data);
    });

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const onCanvasDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const regionId = target.closest<HTMLElement>("[data-region]")?.dataset.region;
    const corner = target.dataset.corner as "nw" | "ne" | "sw" | "se" | undefined;
    const p = point(e);
    if (regionId) {
      setSelected(regionId);
      setPanel("none");
      const b = boxes.find((x) => x.id === regionId)!.box;
      if (!drawMode) return;
      canvas.current!.setPointerCapture(e.pointerId);
      if (corner) setDrag({ kind: "resize", id: regionId, corner, orig: b, box: b });
      else setDrag({ kind: "move", id: regionId, startX: p.x, startY: p.y, orig: b, box: b });
      return;
    }
    if (!drawMode) {
      setSelected(null);
      return;
    }
    canvas.current!.setPointerCapture(e.pointerId);
    setSelected(null);
    setDrag({ kind: "draw", startX: p.x, startY: p.y, box: { x: p.x, y: p.y, w: 0, h: 0 } });
  };

  const onCanvasMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = point(e);
    if (drag.kind === "draw") {
      const x = Math.min(drag.startX, p.x);
      const y = Math.min(drag.startY, p.y);
      setDrag({ ...drag, box: { x, y, w: Math.abs(p.x - drag.startX), h: Math.abs(p.y - drag.startY) } });
    } else if (drag.kind === "move") {
      const o = drag.orig;
      const x = clamp(o.x + (p.x - drag.startX), 0, 1 - o.w);
      const y = clamp(o.y + (p.y - drag.startY), 0, 1 - o.h);
      setDrag({ ...drag, box: { ...o, x, y } });
    } else {
      const o = drag.orig;
      let { x, y } = o;
      let x2 = o.x + o.w;
      let y2 = o.y + o.h;
      if (drag.corner.includes("w")) x = Math.min(p.x, x2 - MIN);
      if (drag.corner.includes("e")) x2 = Math.max(p.x, x + MIN);
      if (drag.corner.includes("n")) y = Math.min(p.y, y2 - MIN);
      if (drag.corner.includes("s")) y2 = Math.max(p.y, y + MIN);
      setDrag({ ...drag, box: { x, y, w: x2 - x, h: y2 - y } });
    }
  };

  const onCanvasUp = () => {
    if (!drag) return;
    const b = round(drag.box);
    setDrag(null);
    if (drag.kind === "draw") {
      if (b.w < MIN * 2 || b.h < MIN * 2) return; // a click, not a box
      setGhost(b);
      act(
        () => createRegion(image.id, b),
        (id) => {
          setSelected(id as string);
          setPanel("new");
        },
      );
    } else {
      const o = drag.orig;
      if (b.x === o.x && b.y === o.y && b.w === o.w && b.h === o.h) return;
      setOverrides((m) => ({ ...m, [drag.id]: b }));
      act(() => updateRegionBox(drag.id, b));
    }
  };

  // keyboard: Escape deselects, Delete removes an undecided box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "Escape") { setSelected(null); setPanel("none"); }
      if ((e.key === "Delete" || e.key === "Backspace") && sel && sel.status !== "linked") {
        e.preventDefault();
        act(() => deleteRegion(sel.id), () => setSelected(null));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const nextOpen = (afterId: string) => {
    const idx = boxes.findIndex((b) => b.id === afterId);
    const rest = [...boxes.slice(idx + 1), ...boxes.slice(0, idx)];
    return rest.find((b) => b.status === "pending")?.id ?? null;
  };
  const advance = (fromId: string) => {
    setPanel("none");
    setSelected(nextOpen(fromId));
  };

  const counts = {
    total: boxes.length,
    linked: boxes.filter((b) => b.status === "linked").length,
    open: boxes.filter((b) => b.status === "pending").length,
    unresolved: boxes.filter((b) => b.status === "unresolved").length,
    rejected: boxes.filter((b) => b.status === "rejected").length,
  };

  const shown = (b: (typeof boxes)[number]) => (drag && "id" in drag && drag.id === b.id ? drag.box : b.box);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/import" className="text-sm text-muted hover:text-ink">← All photos</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="truncate font-display text-3xl sm:text-4xl">{image.original_filename}</h1>
            <AuditBadge status={image.audit_status} />
          </div>
        </div>
        <div className="flex gap-2">
          <a className="btn-ghost btn-sm" href={sourceImageUrl(image.id, "original")}>Original file</a>
          {nextId ? (
            <Link className="btn-primary btn-sm" href={`/import/${nextId}`}>Next open photo →</Link>
          ) : (
            <span className="btn-ghost btn-sm opacity-60">No other open photos</span>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        {/* ---------------------------------------------------------------- photo */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>{drawMode ? "Drag on the photo to box each item. Drag a box to move it, corners to resize." : "Tap a box to select it."}</span>
            <button className="btn-ghost btn-sm" onClick={() => setDrawMode((d) => !d)}>
              {drawMode ? "Done drawing" : "Draw boxes"}
            </button>
          </div>
          <div
            ref={canvas}
            data-testid="canvas"
            className={`relative mx-auto select-none overflow-hidden rounded-xl bg-stone-200 ${drawMode ? "cursor-crosshair touch-none" : ""}`}
            style={{ aspectRatio: `${image.width} / ${image.height}`, maxHeight: "78vh", maxWidth: `calc(78vh * ${image.width / image.height})` }}
            onPointerDown={onCanvasDown}
            onPointerMove={onCanvasMove}
            onPointerUp={onCanvasUp}
            onPointerCancel={() => setDrag(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sourceImageUrl(image.id, "display")} alt={image.original_filename} draggable={false} className="pointer-events-none h-full w-full" />
            {boxes.map((b) => {
              const s = shown(b);
              const isSel = b.id === selected;
              return (
                <div
                  key={b.id}
                  data-region={b.id}
                  className="absolute"
                  style={{
                    left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%`,
                    border: `${isSel ? 3 : 2}px solid ${regionOf(b.status).stroke}`,
                    background: isSel ? "rgba(255,255,255,0.12)" : "transparent",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                    cursor: drawMode ? "move" : "pointer",
                  }}
                >
                  <span
                    className="absolute -left-0.5 -top-0.5 rounded-br-md px-1.5 py-0.5 text-[11px] font-semibold text-white"
                    style={{ background: regionOf(b.status).stroke }}
                  >
                    {b.n}{b.item ? ` · ${b.item.display_id}` : ""}
                  </span>
                  {isSel && drawMode &&
                    (["nw", "ne", "sw", "se"] as const).map((c) => (
                      <span
                        key={c}
                        data-corner={c}
                        className="absolute h-4 w-4 rounded-full border-2 border-white bg-ink"
                        style={{
                          [c.includes("n") ? "top" : "bottom"]: -8,
                          [c.includes("w") ? "left" : "right"]: -8,
                          cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
                        }}
                      />
                    ))}
                </div>
              );
            })}
            {(drag?.kind === "draw" || ghost) && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-white"
                style={{
                  ...(() => {
                    const b = drag?.kind === "draw" ? drag.box : ghost!;
                    return { left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` };
                  })(),
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                }}
              />
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------- panel */}
        <div className="space-y-4">
          <section className="card p-4">
            <p className="label">What does this photo show?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(CLASSIFICATION) as Classification[]).filter((c) => c !== "unclassified").map((c) => (
                <button
                  key={c}
                  title={classificationOf(c).hint}
                  disabled={pending}
                  onClick={() => act(() => setClassification(image.id, c))}
                  className={`rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${
                    image.classification === c ? "bg-ink text-paper ring-ink" : "bg-paper ring-line hover:ring-ink/40"
                  }`}
                >
                  {classificationOf(c).label}
                </button>
              ))}
            </div>
            {image.classification === "unrelated" && counts.linked > 0 && (
              <p className="mt-2 text-xs text-rose-700">This photo is marked unrelated but has linked items. Unlink them or reclassify.</p>
            )}
          </section>

          <section className="card p-4">
            <div className="flex items-baseline justify-between">
              <p className="label">Items in this photo</p>
              <p className="text-xs text-muted">
                {counts.total} boxed · {counts.linked} linked{counts.open ? ` · ${counts.open} open` : ""}
                {counts.unresolved ? ` · ${counts.unresolved} unresolved` : ""}{counts.rejected ? ` · ${counts.rejected} not wardrobe` : ""}
              </p>
            </div>
            {boxes.length === 0 ? (
              <p className="py-3 text-sm text-muted">
                {image.classification === "unrelated" ? "No boxes needed for an unrelated photo." : "Draw a box around each garment or shoe you can see. One box per item, even if they look alike."}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5" data-testid="region-list">
                {boxes.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => { setSelected(b.id); setPanel("none"); }}
                      className={`flex w-full items-center gap-3 rounded-lg p-1.5 text-left ring-1 transition ${b.id === selected ? "bg-paper ring-ink" : "ring-transparent hover:bg-paper"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={regionImageUrl(b.id, b.version, 240)} alt="" className="h-12 w-12 shrink-0 rounded-md bg-stone-200 object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span className="font-semibold">{b.n}.</span>{" "}
                          {b.item ? <>{b.item.display_id} {b.item.brand} {b.item.name}</> : b.label || regionOf(b.status).label}
                        </p>
                        <span className={`mt-0.5 inline-block rounded px-1.5 text-[11px] ${regionOf(b.status).tone}`}>{regionOf(b.status).label}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {sel && (
            <section className="card p-4" data-testid="region-panel">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={regionImageUrl(sel.id, sel.version, 480)} alt="" className="h-24 w-24 shrink-0 rounded-lg bg-stone-200 object-contain" />
                <div className="min-w-0">
                  <p className="label">Box {sel.n}</p>
                  {sel.item ? (
                    <>
                      <Link href={`/closet/${sel.item.id}`} className="font-medium underline-offset-2 hover:underline">
                        {sel.item.display_id} · {[sel.item.brand, sel.item.name].filter(Boolean).join(" ") || "Untitled"}
                      </Link>
                      <div className="mt-1"><VerificationBadge status={sel.item.verification_status} /></div>
                    </>
                  ) : (
                    <p className="text-sm text-muted">{regionOf(sel.status).label}{sel.notes ? `: ${sel.notes}` : ""}</p>
                  )}
                </div>
              </div>

              {sel.item ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {sel.item.verification_status !== "photo_verified" && (
                    <button className="btn-primary btn-sm" disabled={pending} onClick={() => act(() => setItemStatus(sel.item!.id, "photo_verified"))}>
                      Verify from this photo
                    </button>
                  )}
                  <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => setRegionStatus(sel.id, "pending"))}>
                    Unlink
                  </button>
                </div>
              ) : panel === "new" ? (
                <div className="mt-4">
                  <ItemQuickForm
                    categories={categories}
                    pending={pending}
                    onCancel={() => setPanel("none")}
                    onSubmit={(fields, verify) =>
                      act(() => createItemFromRegion(sel.id, fields, verify), () => advance(sel.id))
                    }
                  />
                </div>
              ) : panel === "link" ? (
                <div className="mt-4">
                  <ItemPicker
                    items={items}
                    categories={categories}
                    onCancel={() => setPanel("none")}
                    onPick={(itemId) => act(() => linkRegionToItem(sel.id, itemId), () => advance(sel.id))}
                  />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button className="btn-primary btn-sm" onClick={() => setPanel("new")}>New item</button>
                  <button className="btn-ghost btn-sm" onClick={() => setPanel("link")}>Same as an existing item</button>
                  <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => setRegionStatus(sel.id, "rejected"), () => advance(sel.id))}>
                    Not wardrobe
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => {
                      const note = window.prompt("What is unclear about this item? (optional)", sel.notes) ?? sel.notes;
                      act(async () => {
                        const r = await updateRegionNote(sel.id, sel.label, note);
                        return r.ok ? setRegionStatus(sel.id, "unresolved") : r;
                      }, () => advance(sel.id));
                    }}
                  >
                    Can&apos;t tell yet
                  </button>
                  {sel.status !== "pending" && (
                    <button className="btn-ghost btn-sm col-span-2" disabled={pending} onClick={() => act(() => setRegionStatus(sel.id, "pending"))}>
                      Reopen this box
                    </button>
                  )}
                  <button className="btn-danger btn-sm col-span-2" disabled={pending} onClick={() => act(() => deleteRegion(sel.id), () => setSelected(null))}>
                    Delete box
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="card p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-black"
                checked={image.no_more_items_confirmed}
                disabled={pending}
                onChange={(e) => act(() => setNoMoreItems(image.id, e.target.checked))}
              />
              <span className="text-sm">
                <span className="font-medium">Every wardrobe item in this photo is boxed.</span>
                <span className="block text-muted">The photo only counts as audited when this is checked and every box is decided.</span>
              </span>
            </label>
            <AuditExplainer image={image} counts={counts} />
          </section>
        </div>
      </div>
    </div>
  );
}

function AuditExplainer({ image, counts }: { image: Img; counts: { total: number; linked: number; open: number; unresolved: number } }) {
  if (image.audit_status === "audited") return <p className="mt-3 text-xs text-emerald-800">This photo is fully accounted for.</p>;
  const todo: string[] = [];
  if (image.classification === "unclassified") todo.push("choose what the photo shows");
  if (image.classification === "needs_review") todo.push("resolve the photo's needs-review flag");
  if (counts.open) todo.push(`decide ${counts.open} open box${counts.open > 1 ? "es" : ""}`);
  if (counts.unresolved) todo.push(`resolve ${counts.unresolved} unresolved box${counts.unresolved > 1 ? "es" : ""}`);
  if (image.classification !== "unrelated") {
    if (counts.linked === 0 && image.classification !== "unclassified") todo.push("link at least one item, or mark the photo unrelated");
    if (!image.no_more_items_confirmed) todo.push("confirm every item is boxed");
  } else if (counts.linked + counts.open + counts.unresolved > 0) {
    todo.push("remove or reject boxes on an unrelated photo");
  }
  return todo.length ? <p className="mt-3 text-xs text-muted">To finish: {todo.join("; ")}.</p> : null;
}
