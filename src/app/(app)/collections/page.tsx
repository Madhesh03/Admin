"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import {
  createCollection,
  listCollections,
  updateCollection,
  type CollectionInput,
} from "@/lib/admin-api";
import { collectionSchema } from "@/lib/schemas";
import type { Collection } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

export default function CollectionsPage() {
  return (
    <RequirePermission perm="catalog.view_product">
      <CollectionsInner />
    </RequirePermission>
  );
}

function CollectionsInner() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useAsync<Collection[]>(() => listCollections(), []);
  const [editing, setEditing] = React.useState<Collection | "new" | null>(null);

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Curated groupings for merchandising the storefront."
        actions={can("catalog.add_product") && <Button onClick={() => setEditing("new")}><Plus className="size-4" />Add collection</Button>}
      />
      <Card>
        {loading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No collections yet" />
        ) : (
          <Table>
            <THead><tr><Th className="w-[50%]">Collection</Th><Th>Slug</Th><Th>Status</Th>{can("catalog.edit_product") && <Th />}</tr></THead>
            <TBody>
              {data.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb src={c.banner_image_key} alt={c.name} className="h-10 w-16 shrink-0" />
                      <div>
                        <p className="font-semibold text-ink">{c.name}</p>
                        <p className="truncate text-xs text-faint">{c.description}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-faint">{c.slug}</Td>
                  <Td><Badge className={c.is_active ? "bg-green-100 text-green-700" : "bg-surface text-muted"}>{c.is_active ? "Active" : "Inactive"}</Badge></Td>
                  {can("catalog.edit_product") && <Td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(c)}><Pencil className="size-4" />Edit</Button></Td>}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {editing && (
        <CollectionDialog
          collection={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function CollectionDialog({ collection, onClose, onSaved }: { collection: Collection | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<CollectionInput>({
    name: collection?.name ?? "",
    description: collection?.description ?? "",
    banner_image_key: collection?.banner_image_key ?? "",
    is_active: collection?.is_active ?? true,
    sort_order: collection?.sort_order ?? 0,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const parsed = collectionSchema.safeParse(form);
    if (!parsed.success) {
      setErrors({ name: parsed.error.flatten().fieldErrors.name?.[0] ?? "" });
      return;
    }
    setBusy(true);
    try {
      if (collection) await updateCollection(collection.id, parsed.data);
      else await createCollection(parsed.data);
      toast.success(collection ? "Collection updated" : "Collection created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={collection ? "Edit collection" : "New collection"}>
        <div className="space-y-4">
          <Field label="Name" required error={errors.name}><Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Banner URL / key"><Input value={form.banner_image_key} onChange={(e) => setForm({ ...form, banner_image_key: e.target.value })} /></Field>
          <Field label="Sort order"><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
          <ToggleField label="Active" checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} onClick={submit}>{collection ? "Save" : "Create"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
