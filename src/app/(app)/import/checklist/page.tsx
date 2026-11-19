import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getCategories, getChecklist, listItemOptions } from "@/lib/queries";
import { Checklist } from "@/components/checklist";

export default async function ChecklistPage() {
  await requireAuth();
  const [entries, categories, items] = await Promise.all([getChecklist(), getCategories(), listItemOptions()]);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/import" className="text-sm text-muted hover:text-ink">← Import & Audit</Link>
        <p className="eyebrow mt-3">Expected-items checklist</p>
        <h1 className="font-display mt-1 text-5xl">What should be here</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Expectations, not inventory. Nothing on this page appears in your closet or will ever be recommended.</p>
      </div>
      <Checklist entries={entries as never} categories={categories} items={items} />
    </div>
  );
}
