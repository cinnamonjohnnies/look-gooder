import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getCategories, getNextOpenImage, getRegions, getSourceImage, listItemOptions } from "@/lib/queries";
import { RegionEditor } from "@/components/region-editor";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const image = await getSourceImage(id);
  if (!image) notFound();
  const [regions, categories, items, nextId] = await Promise.all([
    getRegions(id),
    getCategories(),
    listItemOptions(),
    getNextOpenImage(id),
  ]);
  return (
    <RegionEditor
      image={{
        id: image.id,
        width: image.width,
        height: image.height,
        classification: image.classification,
        no_more_items_confirmed: image.no_more_items_confirmed,
        audit_status: image.audit_status,
        original_filename: image.original_filename,
      }}
      regions={regions}
      categories={categories}
      items={items}
      nextId={nextId}
    />
  );
}
