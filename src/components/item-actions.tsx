"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteItem, mergeItem, setItemStatus, setPrimaryRegion } from "@/app/actions";
import type { Category, ItemOption, VerificationStatus } from "@/lib/domain";
import { ItemPicker } from "./item-picker";

export function ItemActions(props: {
  id: string;
  displayId: string;
  status: VerificationStatus;
  photoCount: number;
  deleted: boolean;
  items: ItemOption[];
  categories: Category[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Failed");
      else after?.();
    });

  if (props.deleted) return null;
  const s = props.status;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {s !== "photo_verified" && s !== "archived" && (
          <button className="btn-primary btn-sm" disabled={pending || props.photoCount === 0}
            title={props.photoCount === 0 ? "Link this item to a photo first" : ""}
            onClick={() => act(() => setItemStatus(props.id, "photo_verified"))}>
            Verify from photo
          </button>
        )}
        {s !== "description_confirmed" && s !== "archived" && s !== "photo_verified" && (
          <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => setItemStatus(props.id, "description_confirmed"))}>
            I own this (no photo)
          </button>
        )}
        {s !== "needs_review" && s !== "archived" && (
          <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => setItemStatus(props.id, "needs_review"))}>Flag for review</button>
        )}
        {s === "archived" ? (
          <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => setItemStatus(props.id, "unarchive"))}>Restore from archive</button>
        ) : (
          <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => setItemStatus(props.id, "archive"))}>Archive</button>
        )}
        <button className="btn-ghost btn-sm" onClick={() => setMerging((m) => !m)}>Merge duplicate…</button>
        <button className="btn-danger btn-sm" disabled={pending}
          onClick={() => {
            if (window.confirm(`Delete ${props.displayId}? Its photo boxes go back to "needs a decision". The ID ${props.displayId} will never be reused.`))
              act(() => deleteItem(props.id), () => router.push("/closet"));
          }}>
          Delete
        </button>
      </div>
      {err && <p className="text-sm text-rose-700">{err}</p>}
      {merging && (
        <div className="card p-3">
          <ItemPicker
            title={`Merge ${props.displayId} into which item? Its photos move there and ${props.displayId} is retired.`}
            items={props.items}
            categories={props.categories}
            exclude={props.id}
            onCancel={() => setMerging(false)}
            onPick={(into) => {
              const target = props.items.find((i) => i.id === into);
              if (window.confirm(`Merge ${props.displayId} into ${target?.display_id}? This cannot be undone.`))
                act(() => mergeItem(props.id, into), () => router.push(`/closet/${into}`));
            }}
          />
        </div>
      )}
    </div>
  );
}

export function MakePrimary({ itemId, regionId }: { itemId: string; regionId: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-muted underline hover:text-ink" disabled={pending}
      onClick={() => start(async () => { await setPrimaryRegion(itemId, regionId); })}>
      Make main photo
    </button>
  );
}
