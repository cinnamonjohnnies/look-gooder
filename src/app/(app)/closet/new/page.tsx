import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import { ItemEditForm } from "@/components/item-edit-form";

export default async function NewItemPage() {
  await requireAuth();
  const categories = await getCategories();
  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/closet" className="text-sm text-muted hover:text-ink">← Closet</Link>
      <div>
        <h1 className="font-display text-5xl">Add an item without a photo</h1>
        <p className="mt-2 text-sm text-muted">
          It starts as a candidate. Mark it &quot;I own this&quot; to make it description-confirmed, or box it on a photo later to photo-verify it.
        </p>
      </div>
      <div className="card p-5"><ItemEditForm categories={categories} /></div>
    </div>
  );
}
